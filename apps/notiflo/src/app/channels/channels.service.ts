import { Inject, Injectable } from '@nestjs/common';
import {
  Channel,
  ChannelMessage,
  SendResult,
  IChannelRegistry,
  CHANNEL_REGISTRY,
  ChannelNotConfiguredError,
  ProviderSendError,
} from '../core';

/**
 * High-level service for sending messages through channels.
 * Routes messages to the correct provider via the channel registry.
 */
@Injectable()
export class ChannelsService {
  constructor(
    @Inject(CHANNEL_REGISTRY)
    private readonly registry: IChannelRegistry,
  ) {}

  /**
   * Send a message through a specific channel.
   * Optionally specify a provider name; otherwise uses the primary provider.
   *
   * @throws ChannelNotConfiguredError if no provider is found for the channel
   * @throws ProviderSendError if the provider fails to send
   */
  async send(
    channel: Channel,
    message: ChannelMessage,
    providerName?: string,
  ): Promise<SendResult> {
    const provider = this.registry.getProvider(channel, providerName);

    if (!provider) {
      throw new ChannelNotConfiguredError(channel);
    }

    try {
      return await provider.send(message as never);
    } catch (error) {
      throw new ProviderSendError(
        provider.name,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get all channels that have at least one active provider.
   */
  getAvailableChannels(): Channel[] {
    return this.registry
      .getChannels()
      .filter((channel) => this.registry.hasActiveProvider(channel));
  }
}
