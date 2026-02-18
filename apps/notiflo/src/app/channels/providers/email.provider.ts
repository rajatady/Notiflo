import { Injectable } from '@nestjs/common';
import { Channel, EmailMessage } from '../../core';
import { BaseProvider } from './base.provider';

/**
 * Mock email provider simulating a SendGrid-style API.
 * Does not call real APIs; suitable for testing and development.
 */
@Injectable()
export class EmailProvider extends BaseProvider<Channel.EMAIL> {
  readonly channel = Channel.EMAIL;
  readonly name = 'sendgrid';

  private config = {
    apiKey: 'mock-sendgrid-api-key',
    fromAddress: 'noreply@notiflo.io',
  };

  protected async doSend(
    message: EmailMessage,
  ): Promise<Record<string, unknown>> {
    // Simulate SendGrid API call
    // In a real implementation, this would call the SendGrid REST API
    return {
      to: message.to,
      subject: message.subject,
      from: message.from ?? this.config.fromAddress,
    };
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.config.apiKey && this.config.fromAddress);
  }
}
