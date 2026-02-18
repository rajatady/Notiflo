import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import {
  IngestEventDto,
  WebhookConfigDto,
} from './dto/create-webhook.dto';

// ---------------------------------------------------------------------------
// WebhooksController - event ingestion & webhook config CRUD
// ---------------------------------------------------------------------------

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /webhooks/:orgSlug/events
   * Ingest an external event from an organization's integration.
   * Returns 202 Accepted to signal asynchronous processing.
   */
  @Post(':orgSlug/events')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestEvent(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: IngestEventDto,
  ) {
    return this.webhooksService.ingestEvent(orgSlug, dto);
  }

  /**
   * GET /webhooks/configs
   * List all webhook configurations for the calling organization.
   *
   * NOTE: In a production system the orgId would come from the authenticated
   * user/token context. For now it is accepted as a query-level header.
   */
  @Get('configs')
  async listConfigs(@Headers('x-organization-id') orgId: string) {
    if (!orgId) {
      throw new BadRequestException(
        'x-organization-id header is required',
      );
    }
    return this.webhooksService.listWebhookConfigs(orgId);
  }

  /**
   * POST /webhooks/configs
   * Create a new outbound webhook configuration.
   */
  @Post('configs')
  @HttpCode(HttpStatus.CREATED)
  async createConfig(
    @Headers('x-organization-id') orgId: string,
    @Body() dto: WebhookConfigDto,
  ) {
    if (!orgId) {
      throw new BadRequestException(
        'x-organization-id header is required',
      );
    }
    return this.webhooksService.createWebhookConfig(orgId, dto);
  }

  /**
   * DELETE /webhooks/configs/:id
   * Remove a webhook configuration.
   */
  @Delete('configs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(
    @Headers('x-organization-id') orgId: string,
    @Param('id') id: string,
  ) {
    if (!orgId) {
      throw new BadRequestException(
        'x-organization-id header is required',
      );
    }
    await this.webhooksService.deleteWebhookConfig(orgId, id);
  }
}

// ---------------------------------------------------------------------------
// ProviderWebhooksController - inbound delivery status callbacks
// ---------------------------------------------------------------------------

@Controller('webhooks/providers')
export class ProviderWebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /webhooks/providers/sendgrid
   * SendGrid Event Webhook callback.
   */
  @Post('sendgrid')
  @HttpCode(HttpStatus.OK)
  async sendgridCallback(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.webhooksService.processProviderCallback(
      'sendgrid',
      payload,
      headers,
    );
  }

  /**
   * POST /webhooks/providers/twilio
   * Twilio status callback.
   */
  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async twilioCallback(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.webhooksService.processProviderCallback(
      'twilio',
      payload,
      headers,
    );
  }

  /**
   * POST /webhooks/providers/fcm
   * Firebase Cloud Messaging delivery receipt.
   */
  @Post('fcm')
  @HttpCode(HttpStatus.OK)
  async fcmCallback(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.webhooksService.processProviderCallback(
      'fcm',
      payload,
      headers,
    );
  }

  /**
   * POST /webhooks/providers/:provider
   * Generic provider callback.
   */
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async genericCallback(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.webhooksService.processProviderCallback(
      provider,
      payload,
      headers,
    );
  }
}
