import { Injectable } from '@nestjs/common';
import { Channel, InAppMessage } from '../../core';
import { BaseProvider } from './base.provider';

/**
 * In-app notification provider.
 * Stores messages in memory for delivery via real-time connections.
 * This is Notiflo's own channel - no external API required.
 */
@Injectable()
export class InAppProvider extends BaseProvider<Channel.IN_APP> {
  readonly channel = Channel.IN_APP;
  readonly name = 'notiflo-in-app';

  private storedMessages: InAppMessage[] = [];

  protected async doSend(
    message: InAppMessage,
  ): Promise<Record<string, unknown>> {
    // Store the message in memory for retrieval
    this.storedMessages.push({ ...message });

    return {
      subscriberId: message.subscriberId,
      hasActionUrl: !!message.actionUrl,
      storedCount: this.storedMessages.length,
    };
  }

  async validateConfig(): Promise<boolean> {
    // In-app provider is always valid since it uses in-memory storage
    return true;
  }

  /**
   * Returns all stored in-app messages.
   * Useful for testing and debugging.
   */
  getStoredMessages(): InAppMessage[] {
    return [...this.storedMessages];
  }

  /**
   * Returns stored messages for a specific subscriber.
   */
  getStoredMessagesForSubscriber(subscriberId: string): InAppMessage[] {
    return this.storedMessages.filter(
      (msg) => msg.subscriberId === subscriberId,
    );
  }

  /**
   * Clears all stored messages.
   */
  clearStoredMessages(): void {
    this.storedMessages = [];
  }
}
