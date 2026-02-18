import { Injectable } from '@nestjs/common';
import {
  Channel,
  ChannelMessageMap,
  ProviderStatus,
  SendResult,
  IChannelProvider,
} from '../../core';
import { randomUUID } from 'crypto';

/**
 * Abstract base class for all channel providers.
 * Implements common logic such as message ID generation, error handling,
 * and result building. Concrete providers override `doSend()`.
 */
@Injectable()
export abstract class BaseProvider<C extends Channel>
  implements IChannelProvider<C>
{
  abstract readonly channel: C;
  abstract readonly name: string;

  protected status: ProviderStatus = ProviderStatus.ACTIVE;

  /**
   * Template method: subclasses implement channel-specific send logic here.
   * Should return metadata to include in the SendResult.
   */
  protected abstract doSend(
    message: ChannelMessageMap[C],
  ): Promise<Record<string, unknown>>;

  /**
   * Sends a message through this provider.
   * Wraps the subclass `doSend` in error handling and result construction.
   */
  async send(message: ChannelMessageMap[C]): Promise<SendResult> {
    try {
      const metadata = await this.doSend(message);
      return {
        success: true,
        messageId: this.generateMessageId(),
        providerName: this.name,
        channel: this.channel,
        metadata,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        providerName: this.name,
        channel: this.channel,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Validates the provider configuration.
   * Subclasses can override for specific validation.
   */
  async validateConfig(): Promise<boolean> {
    return true;
  }

  /**
   * Returns the current provider status.
   */
  getStatus(): ProviderStatus {
    return this.status;
  }

  /**
   * Generates a unique message ID.
   */
  protected generateMessageId(): string {
    return `${this.name}-${randomUUID()}`;
  }
}
