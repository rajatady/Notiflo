import { Injectable } from '@nestjs/common';
import { Channel, PushMessage } from '../../core';
import { BaseProvider } from './base.provider';

/**
 * Mock push notification provider simulating Firebase Cloud Messaging (FCM).
 * Does not call real APIs; suitable for testing and development.
 */
@Injectable()
export class PushProvider extends BaseProvider<Channel.PUSH> {
  readonly channel = Channel.PUSH;
  readonly name = 'firebase';

  private config = {
    projectId: 'mock-firebase-project',
    serviceAccountKey: 'mock-service-account-key',
  };

  protected async doSend(
    message: PushMessage,
  ): Promise<Record<string, unknown>> {
    // Simulate Firebase FCM API call
    // In a real implementation, this would call the FCM HTTP v1 API
    return {
      title: message.title,
      tokenCount: message.tokens.length,
      hasData: !!message.data,
    };
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.config.projectId && this.config.serviceAccountKey);
  }
}
