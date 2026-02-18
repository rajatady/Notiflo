import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import {
  IngestEventDto,
  ProviderWebhookDto,
  WebhookConfigDto,
} from './dto/create-webhook.dto';
import { WebhookConfigDocument } from './schemas/webhook-config.schema';
import { PayloadValidator } from './validation/payload-validator';
import { SignatureValidator } from './validation/signature-validator';
import { EventSource } from '../core';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookConfigDocument.name)
    private readonly webhookConfigModel: Model<WebhookConfigDocument>,
    private readonly eventsService: EventsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Event Ingestion
  // ---------------------------------------------------------------------------

  /**
   * Ingest an external event received through the webhook endpoint.
   * Validates the payload, persists it as a NotifloEvent with WEBHOOK source,
   * and publishes it through the event bus for downstream processing.
   */
  async ingestEvent(
    orgId: string,
    dto: IngestEventDto,
  ): Promise<{ eventId: string; accepted: boolean }> {
    // Validate the ingest payload
    const validation = PayloadValidator.validateIngestEvent(dto);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Invalid event payload',
        errors: validation.errors,
      });
    }

    this.logger.log(
      `Ingesting event '${dto.name}' for org '${orgId}'`,
    );

    // Delegate to EventsService which persists and publishes to the bus
    const eventDoc = await this.eventsService.ingest({
      organizationId: orgId,
      name: dto.name,
      subscriberId: dto.subscriberId,
      payload: dto.payload,
      source: EventSource.WEBHOOK,
    });

    return {
      eventId: eventDoc._id.toString(),
      accepted: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Provider Callbacks
  // ---------------------------------------------------------------------------

  /**
   * Process a delivery status callback from an email/sms/push provider.
   * Validates the provider signature when applicable, normalizes the payload,
   * and publishes a status update event.
   */
  async processProviderCallback(
    provider: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<{ processed: boolean; events?: ProviderWebhookDto[] }> {
    this.logger.log(`Processing ${provider} provider callback`);

    // Provider-specific signature validation
    this.validateProviderSignature(provider, payload, headers);

    // For SendGrid, the payload is an array; handle all events
    if (provider.toLowerCase() === 'sendgrid' && Array.isArray(payload)) {
      const normalizedEvents =
        PayloadValidator.normalizeSendGridWebhook(payload);

      for (const event of normalizedEvents) {
        await this.publishStatusUpdate(event);
      }

      return { processed: true, events: normalizedEvents };
    }

    // Single-event providers (Twilio, FCM, generic)
    const validation = PayloadValidator.validateProviderWebhook(
      provider,
      payload,
    );

    if (!validation.valid) {
      throw new BadRequestException({
        message: `Invalid ${provider} webhook payload`,
        errors: validation.errors,
      });
    }

    await this.publishStatusUpdate(validation.normalized);

    return { processed: true, events: [validation.normalized] };
  }

  // ---------------------------------------------------------------------------
  // Webhook Configuration CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new outbound webhook configuration for an organization.
   */
  async createWebhookConfig(
    orgId: string,
    dto: WebhookConfigDto,
  ): Promise<WebhookConfigDocument> {
    this.logger.log(
      `Creating webhook config '${dto.name}' for org '${orgId}'`,
    );

    return this.webhookConfigModel.create({
      organizationId: orgId,
      name: dto.name,
      description: dto.description,
      url: dto.url,
      secret: dto.secret,
      events: dto.events || [],
      headers: dto.headers || {},
      active: dto.active !== undefined ? dto.active : true,
    });
  }

  /**
   * List all outbound webhook configurations for an organization.
   */
  async listWebhookConfigs(orgId: string): Promise<WebhookConfigDocument[]> {
    return this.webhookConfigModel
      .find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Delete a webhook configuration by ID, scoped to an organization.
   */
  async deleteWebhookConfig(
    orgId: string,
    webhookId: string,
  ): Promise<void> {
    const result = await this.webhookConfigModel
      .findOneAndDelete({ _id: webhookId, organizationId: orgId })
      .exec();

    if (!result) {
      throw new NotFoundException(
        `Webhook config '${webhookId}' not found for organization '${orgId}'`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate the signature of an inbound provider callback.
   * Throws UnauthorizedException when validation fails.
   */
  private validateProviderSignature(
    provider: string,
    payload: unknown,
    headers: Record<string, string>,
  ): void {
    const normalizedHeaders = this.normalizeHeaders(headers);

    switch (provider.toLowerCase()) {
      case 'sendgrid': {
        const signature =
          normalizedHeaders['x-twilio-email-event-webhook-signature'];
        const timestamp =
          normalizedHeaders['x-twilio-email-event-webhook-timestamp'];
        const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

        // Only validate if a verification key is configured
        if (verificationKey && signature && timestamp) {
          const payloadString =
            typeof payload === 'string'
              ? payload
              : JSON.stringify(payload);

          const valid = SignatureValidator.validateSendGrid(
            payloadString,
            signature,
            timestamp,
            verificationKey,
          );

          if (!valid) {
            throw new UnauthorizedException(
              'Invalid SendGrid webhook signature',
            );
          }
        }
        break;
      }
      case 'twilio': {
        const signature = normalizedHeaders['x-twilio-signature'];
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const webhookUrl = process.env.TWILIO_WEBHOOK_URL;

        if (authToken && signature && webhookUrl) {
          const params =
            payload && typeof payload === 'object'
              ? (payload as Record<string, string>)
              : {};

          const valid = SignatureValidator.validateTwilio(
            webhookUrl,
            params,
            signature,
            authToken,
          );

          if (!valid) {
            throw new UnauthorizedException(
              'Invalid Twilio webhook signature',
            );
          }
        }
        break;
      }
      default:
        // Generic providers: check for x-webhook-signature header
        {
          const signature = normalizedHeaders['x-webhook-signature'];
          const secret = process.env.WEBHOOK_SIGNING_SECRET;

          if (secret && signature) {
            const payloadString =
              typeof payload === 'string'
                ? payload
                : JSON.stringify(payload);

            const valid = SignatureValidator.validate(
              payloadString,
              signature,
              secret,
            );

            if (!valid) {
              throw new UnauthorizedException(
                'Invalid webhook signature',
              );
            }
          }
        }
        break;
    }
  }

  /**
   * Publish a normalized provider status update through the event bus.
   */
  private async publishStatusUpdate(
    dto: ProviderWebhookDto,
  ): Promise<void> {
    this.logger.log(
      `Status update: provider=${dto.provider} messageId=${dto.messageId} status=${dto.status}`,
    );

    // Publish as an internal event so the pipeline can update notification records
    await this.eventsService.ingest({
      organizationId: 'system',
      name: `provider.status.${dto.provider}.${dto.status}`,
      payload: {
        provider: dto.provider,
        messageId: dto.messageId,
        status: dto.status,
        error: dto.error,
        metadata: dto.metadata,
        timestamp: dto.timestamp,
      },
      source: EventSource.WEBHOOK,
    });
  }

  /**
   * Lowercase all header keys for consistent lookup.
   */
  private normalizeHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }
}
