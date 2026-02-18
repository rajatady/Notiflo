import { ProviderWebhookDto } from '../dto/create-webhook.dto';

/**
 * Validates and normalizes inbound webhook payloads from external providers
 * and user-submitted event ingestion requests.
 */
export class PayloadValidator {
  /**
   * Validate an ingest event payload from the public webhook endpoint.
   */
  static validateIngestEvent(
    payload: unknown,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be a non-null object'] };
    }

    const data = payload as Record<string, unknown>;

    if (!data.name || typeof data.name !== 'string') {
      errors.push('name is required and must be a string');
    }

    if (!data.payload || typeof data.payload !== 'object') {
      errors.push('payload is required and must be an object');
    }

    if (data.subscriberId !== undefined && typeof data.subscriberId !== 'string') {
      errors.push('subscriberId must be a string when provided');
    }

    if (data.idempotencyKey !== undefined && typeof data.idempotencyKey !== 'string') {
      errors.push('idempotencyKey must be a string when provided');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate and normalize a provider webhook payload.
   * Dispatches to the appropriate normalizer based on provider name.
   */
  static validateProviderWebhook(
    provider: string,
    payload: unknown,
  ): { valid: boolean; errors: string[]; normalized?: ProviderWebhookDto } {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be a non-null object'] };
    }

    try {
      switch (provider.toLowerCase()) {
        case 'sendgrid': {
          // SendGrid sends arrays; validateProviderWebhook returns the first event
          const events = PayloadValidator.normalizeSendGridWebhook(payload);
          if (events.length === 0) {
            return { valid: false, errors: ['No events found in SendGrid payload'] };
          }
          return { valid: true, errors: [], normalized: events[0] };
        }
        case 'twilio': {
          const normalized = PayloadValidator.normalizeTwilioWebhook(payload);
          return { valid: true, errors: [], normalized };
        }
        case 'fcm': {
          const normalized = PayloadValidator.normalizeFcmWebhook(payload);
          return { valid: true, errors: [], normalized };
        }
        default: {
          // Generic provider: expect the payload to already be in ProviderWebhookDto shape
          const data = payload as Record<string, unknown>;
          const errors: string[] = [];

          if (!data.messageId || typeof data.messageId !== 'string') {
            errors.push('messageId is required');
          }
          if (!data.status || typeof data.status !== 'string') {
            errors.push('status is required');
          }

          if (errors.length > 0) {
            return { valid: false, errors };
          }

          return {
            valid: true,
            errors: [],
            normalized: {
              provider,
              messageId: data.messageId as string,
              status: data.status as string,
              error: data.error as string | undefined,
              metadata: data.metadata as Record<string, unknown> | undefined,
              timestamp: data.timestamp as string | undefined,
            },
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown validation error';
      return { valid: false, errors: [message] };
    }
  }

  /**
   * Normalize a SendGrid Event Webhook payload.
   * SendGrid sends an array of event objects.
   *
   * @see https://docs.sendgrid.com/for-developers/tracking-events/event
   */
  static normalizeSendGridWebhook(payload: unknown): ProviderWebhookDto[] {
    const events = Array.isArray(payload) ? payload : [payload];

    return events
      .filter((e) => e && typeof e === 'object')
      .map((event: Record<string, unknown>) => {
        const sgMessageId =
          (event.sg_message_id as string) || (event.messageId as string) || '';
        const sgEvent = (event.event as string) || '';
        const timestamp = event.timestamp
          ? new Date((event.timestamp as number) * 1000).toISOString()
          : new Date().toISOString();

        // Map SendGrid event types to our status names
        const statusMap: Record<string, string> = {
          processed: 'queued',
          delivered: 'delivered',
          bounce: 'bounced',
          dropped: 'failed',
          deferred: 'sending',
          open: 'opened',
          click: 'clicked',
          spamreport: 'complained',
          unsubscribe: 'unsubscribed',
        };

        return {
          provider: 'sendgrid',
          messageId: sgMessageId,
          status: statusMap[sgEvent] || sgEvent,
          error: event.reason as string | undefined,
          metadata: {
            email: event.email,
            sgEventId: event.sg_event_id,
            ip: event.ip,
            useragent: event.useragent,
            url: event.url,
            category: event.category,
          },
          timestamp,
        } as ProviderWebhookDto;
      });
  }

  /**
   * Normalize a Twilio status callback payload.
   *
   * @see https://www.twilio.com/docs/sms/api/message-resource#message-status-values
   */
  static normalizeTwilioWebhook(payload: unknown): ProviderWebhookDto {
    const data = payload as Record<string, unknown>;

    const messageSid = (data.MessageSid as string) || (data.SmsSid as string) || '';
    const messageStatus = (data.MessageStatus as string) || (data.SmsStatus as string) || '';

    const statusMap: Record<string, string> = {
      queued: 'queued',
      sending: 'sending',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'failed',
      failed: 'failed',
      received: 'delivered',
    };

    return {
      provider: 'twilio',
      messageId: messageSid,
      status: statusMap[messageStatus] || messageStatus,
      error: data.ErrorCode ? `Error ${data.ErrorCode}: ${data.ErrorMessage || ''}` : undefined,
      metadata: {
        accountSid: data.AccountSid,
        from: data.From,
        to: data.To,
        errorCode: data.ErrorCode,
        errorMessage: data.ErrorMessage,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Normalize an FCM (Firebase Cloud Messaging) delivery receipt.
   *
   * @see https://firebase.google.com/docs/cloud-messaging/concept-options#delivery-receipts
   */
  static normalizeFcmWebhook(payload: unknown): ProviderWebhookDto {
    const data = payload as Record<string, unknown>;

    // FCM can send different payload shapes depending on the callback type
    const messageId =
      (data.message_id as string) ||
      (data.messageId as string) ||
      (data.original_message_id as string) ||
      '';

    const messageType =
      (data.message_type as string) || (data.messageType as string) || '';

    const statusMap: Record<string, string> = {
      ack: 'delivered',
      nack: 'failed',
      receipt: 'delivered',
      control: 'failed',
    };

    return {
      provider: 'fcm',
      messageId,
      status: statusMap[messageType] || messageType || 'delivered',
      error: data.error as string | undefined,
      metadata: {
        from: data.from,
        category: data.category,
        registrationId: data.registration_id,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
