import { Injectable } from '@nestjs/common';
import {
  Channel,
  ProviderStatus,
  IChannelProvider,
  IChannelRegistry,
} from '../../core';

/**
 * Registry service that manages all channel providers.
 * Uses a Map<Channel, IChannelProvider[]> internally.
 * First registered provider for a channel is the primary.
 */
@Injectable()
export class ChannelRegistryService implements IChannelRegistry {
  private readonly providers = new Map<Channel, IChannelProvider[]>();

  /**
   * Register a provider for a channel.
   * The first provider registered for a channel becomes the primary.
   */
  register(provider: IChannelProvider): void {
    const existing = this.providers.get(provider.channel) ?? [];
    existing.push(provider);
    this.providers.set(provider.channel, existing);
  }

  /**
   * Get a provider by channel, optionally by name.
   * If no name is specified, returns the primary (first registered) provider.
   */
  getProvider(
    channel: Channel,
    providerName?: string,
  ): IChannelProvider | undefined {
    const channelProviders = this.providers.get(channel);
    if (!channelProviders || channelProviders.length === 0) {
      return undefined;
    }

    if (providerName) {
      return channelProviders.find((p) => p.name === providerName);
    }

    // Return primary (first registered)
    return channelProviders[0];
  }

  /**
   * Get all providers for a channel.
   */
  getProviders(channel: Channel): IChannelProvider[] {
    return this.providers.get(channel) ?? [];
  }

  /**
   * Get all registered channels.
   */
  getChannels(): Channel[] {
    const channels: Channel[] = [];
    for (const [channel, providers] of this.providers.entries()) {
      if (providers.length > 0) {
        channels.push(channel);
      }
    }
    return channels;
  }

  /**
   * Check if a channel has at least one active provider.
   * Only providers with ACTIVE status are considered.
   */
  hasActiveProvider(channel: Channel): boolean {
    const channelProviders = this.providers.get(channel);
    if (!channelProviders || channelProviders.length === 0) {
      return false;
    }
    return channelProviders.some(
      (p) => p.getStatus() === ProviderStatus.ACTIVE,
    );
  }

  /**
   * Remove a provider by channel and name.
   * Returns true if the provider was found and removed.
   */
  unregister(channel: Channel, providerName: string): boolean {
    const channelProviders = this.providers.get(channel);
    if (!channelProviders || channelProviders.length === 0) {
      return false;
    }

    const index = channelProviders.findIndex((p) => p.name === providerName);
    if (index === -1) {
      return false;
    }

    channelProviders.splice(index, 1);

    // Clean up empty arrays
    if (channelProviders.length === 0) {
      this.providers.delete(channel);
    }

    return true;
  }
}
