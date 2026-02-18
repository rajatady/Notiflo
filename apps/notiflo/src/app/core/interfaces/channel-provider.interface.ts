import {
  Channel,
  ChannelMessage,
  ChannelMessageMap,
  ProviderStatus,
  SendResult,
} from '../types/channel.types';

/**
 * Core abstraction for all channel providers.
 * Every provider (SendGrid, Twilio, Firebase, etc.) implements this interface.
 * This is the key abstraction that makes Notiflo channel-agnostic.
 */
export interface IChannelProvider<C extends Channel = Channel> {
  /** Which channel this provider handles */
  readonly channel: C;

  /** Unique provider name (e.g., 'sendgrid', 'twilio', 'firebase') */
  readonly name: string;

  /** Send a message through this provider */
  send(message: ChannelMessageMap[C]): Promise<SendResult>;

  /** Check if the provider is properly configured */
  validateConfig(): Promise<boolean>;

  /** Get current provider status */
  getStatus(): ProviderStatus;
}

/**
 * Registry that manages all channel providers.
 * Allows registering multiple providers per channel with priority/fallback.
 */
export interface IChannelRegistry {
  /** Register a provider for a channel */
  register(provider: IChannelProvider): void;

  /** Get the primary provider for a channel */
  getProvider(channel: Channel, providerName?: string): IChannelProvider | undefined;

  /** Get all providers for a channel */
  getProviders(channel: Channel): IChannelProvider[];

  /** Get all registered channels */
  getChannels(): Channel[];

  /** Check if a channel has at least one active provider */
  hasActiveProvider(channel: Channel): boolean;

  /** Remove a provider */
  unregister(channel: Channel, providerName: string): boolean;
}

/**
 * Injection tokens for DI
 */
export const CHANNEL_REGISTRY = 'CHANNEL_REGISTRY';
export const CHANNEL_PROVIDERS = 'CHANNEL_PROVIDERS';
