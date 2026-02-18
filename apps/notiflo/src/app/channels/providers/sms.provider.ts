import { Injectable } from '@nestjs/common';
import { Channel, SmsMessage } from '../../core';
import { BaseProvider } from './base.provider';

/**
 * Mock SMS provider simulating a Twilio-style API.
 * Does not call real APIs; suitable for testing and development.
 */
@Injectable()
export class SmsProvider extends BaseProvider<Channel.SMS> {
  readonly channel = Channel.SMS;
  readonly name = 'twilio';

  private config = {
    accountSid: 'mock-twilio-account-sid',
    authToken: 'mock-twilio-auth-token',
    fromNumber: '+15005550006',
  };

  protected async doSend(
    message: SmsMessage,
  ): Promise<Record<string, unknown>> {
    // Simulate Twilio API call
    // In a real implementation, this would call the Twilio REST API
    return {
      to: message.to,
      from: message.from ?? this.config.fromNumber,
      bodyLength: message.body.length,
    };
  }

  async validateConfig(): Promise<boolean> {
    return !!(
      this.config.accountSid &&
      this.config.authToken &&
      this.config.fromNumber
    );
  }
}
