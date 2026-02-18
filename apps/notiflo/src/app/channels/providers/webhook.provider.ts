import { Injectable } from '@nestjs/common';
import { Channel, WebhookMessage } from '../../core';
import { BaseProvider } from './base.provider';

/**
 * Webhook provider that simulates POSTing to a URL.
 * Mocks the HTTP call; in production this would use HttpService/axios.
 */
@Injectable()
export class WebhookProvider extends BaseProvider<Channel.WEBHOOK> {
  readonly channel = Channel.WEBHOOK;
  readonly name = 'webhook';

  protected async doSend(
    message: WebhookMessage,
  ): Promise<Record<string, unknown>> {
    // Simulate HTTP call to the webhook URL
    // In a real implementation, this would use HttpService to make the request
    return {
      url: message.url,
      method: message.method,
      hasBody: !!message.body,
      headerCount: message.headers
        ? Object.keys(message.headers).length
        : 0,
    };
  }

  async validateConfig(): Promise<boolean> {
    // Webhook provider is always valid; config is per-message (the URL)
    return true;
  }
}
