import { Test, TestingModule } from '@nestjs/testing';
import { ChannelRegistryService } from './channel-registry.service';
import {
  Channel,
  ProviderStatus,
  SendResult,
  IChannelProvider,
  CHANNEL_REGISTRY,
} from '../../core';

/**
 * Creates a mock provider for testing purposes.
 */
function createMockProvider(
  channel: Channel,
  name: string,
  status: ProviderStatus = ProviderStatus.ACTIVE,
): IChannelProvider {
  return {
    channel,
    name,
    send: jest.fn().mockResolvedValue({
      success: true,
      messageId: `msg-${name}-${Date.now()}`,
      providerName: name,
      channel,
      timestamp: new Date(),
    } as SendResult),
    validateConfig: jest.fn().mockResolvedValue(true),
    getStatus: jest.fn().mockReturnValue(status),
  };
}

describe('ChannelRegistryService', () => {
  let registry: ChannelRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelRegistryService],
    }).compile();

    registry = module.get<ChannelRegistryService>(ChannelRegistryService);
  });

  it('should be defined', () => {
    expect(registry).toBeDefined();
  });

  describe('register', () => {
    it('should register a provider for a channel', () => {
      const provider = createMockProvider(Channel.EMAIL, 'sendgrid');
      registry.register(provider);

      const retrieved = registry.getProvider(Channel.EMAIL);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('sendgrid');
      expect(retrieved!.channel).toBe(Channel.EMAIL);
    });

    it('should handle multiple providers per channel with first registered as primary', () => {
      const primary = createMockProvider(Channel.EMAIL, 'sendgrid');
      const secondary = createMockProvider(Channel.EMAIL, 'ses');

      registry.register(primary);
      registry.register(secondary);

      // Primary (first registered) should be returned by default
      const retrieved = registry.getProvider(Channel.EMAIL);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('sendgrid');

      // Both should be in the list
      const all = registry.getProviders(Channel.EMAIL);
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('sendgrid');
      expect(all[1].name).toBe('ses');
    });

    it('should register providers across different channels', () => {
      const emailProvider = createMockProvider(Channel.EMAIL, 'sendgrid');
      const smsProvider = createMockProvider(Channel.SMS, 'twilio');

      registry.register(emailProvider);
      registry.register(smsProvider);

      expect(registry.getProvider(Channel.EMAIL)!.name).toBe('sendgrid');
      expect(registry.getProvider(Channel.SMS)!.name).toBe('twilio');
    });
  });

  describe('getProvider', () => {
    it('should get a provider by channel', () => {
      const provider = createMockProvider(Channel.SMS, 'twilio');
      registry.register(provider);

      const result = registry.getProvider(Channel.SMS);
      expect(result).toBeDefined();
      expect(result!.name).toBe('twilio');
    });

    it('should get a provider by channel and name', () => {
      const primary = createMockProvider(Channel.EMAIL, 'sendgrid');
      const secondary = createMockProvider(Channel.EMAIL, 'ses');

      registry.register(primary);
      registry.register(secondary);

      const result = registry.getProvider(Channel.EMAIL, 'ses');
      expect(result).toBeDefined();
      expect(result!.name).toBe('ses');
    });

    it('should return undefined for unregistered channel', () => {
      const result = registry.getProvider(Channel.PUSH);
      expect(result).toBeUndefined();
    });

    it('should return undefined for unregistered provider name', () => {
      const provider = createMockProvider(Channel.EMAIL, 'sendgrid');
      registry.register(provider);

      const result = registry.getProvider(Channel.EMAIL, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getProviders', () => {
    it('should get all providers for a channel', () => {
      const p1 = createMockProvider(Channel.EMAIL, 'sendgrid');
      const p2 = createMockProvider(Channel.EMAIL, 'ses');
      const p3 = createMockProvider(Channel.EMAIL, 'mailgun');

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const providers = registry.getProviders(Channel.EMAIL);
      expect(providers).toHaveLength(3);
      expect(providers.map((p) => p.name)).toEqual([
        'sendgrid',
        'ses',
        'mailgun',
      ]);
    });

    it('should return empty array for channel with no providers', () => {
      const providers = registry.getProviders(Channel.WHATSAPP);
      expect(providers).toEqual([]);
    });
  });

  describe('getChannels', () => {
    it('should list all registered channels', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.register(createMockProvider(Channel.SMS, 'twilio'));
      registry.register(createMockProvider(Channel.PUSH, 'firebase'));

      const channels = registry.getChannels();
      expect(channels).toHaveLength(3);
      expect(channels).toContain(Channel.EMAIL);
      expect(channels).toContain(Channel.SMS);
      expect(channels).toContain(Channel.PUSH);
    });

    it('should return empty array when no channels registered', () => {
      const channels = registry.getChannels();
      expect(channels).toEqual([]);
    });

    it('should not duplicate channels when multiple providers registered for same channel', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.register(createMockProvider(Channel.EMAIL, 'ses'));

      const channels = registry.getChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0]).toBe(Channel.EMAIL);
    });
  });

  describe('hasActiveProvider', () => {
    it('should return true when channel has an active provider', () => {
      registry.register(
        createMockProvider(Channel.EMAIL, 'sendgrid', ProviderStatus.ACTIVE),
      );

      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(true);
    });

    it('should return false when channel has no providers', () => {
      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(false);
    });

    it('should return false when all providers are inactive', () => {
      registry.register(
        createMockProvider(Channel.EMAIL, 'sendgrid', ProviderStatus.INACTIVE),
      );
      registry.register(
        createMockProvider(Channel.EMAIL, 'ses', ProviderStatus.ERROR),
      );

      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(false);
    });

    it('should return true when at least one provider is active among others', () => {
      registry.register(
        createMockProvider(Channel.EMAIL, 'sendgrid', ProviderStatus.INACTIVE),
      );
      registry.register(
        createMockProvider(Channel.EMAIL, 'ses', ProviderStatus.ACTIVE),
      );
      registry.register(
        createMockProvider(
          Channel.EMAIL,
          'mailgun',
          ProviderStatus.RATE_LIMITED,
        ),
      );

      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(true);
    });

    it('should only consider ACTIVE status as active', () => {
      registry.register(
        createMockProvider(
          Channel.EMAIL,
          'sendgrid',
          ProviderStatus.RATE_LIMITED,
        ),
      );

      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should unregister a provider and return true', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));

      const result = registry.unregister(Channel.EMAIL, 'sendgrid');
      expect(result).toBe(true);

      const provider = registry.getProvider(Channel.EMAIL);
      expect(provider).toBeUndefined();
    });

    it('should return false when provider does not exist', () => {
      const result = registry.unregister(Channel.EMAIL, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false when channel has no providers', () => {
      const result = registry.unregister(Channel.PUSH, 'firebase');
      expect(result).toBe(false);
    });

    it('should only remove the specified provider, leaving others intact', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.register(createMockProvider(Channel.EMAIL, 'ses'));
      registry.register(createMockProvider(Channel.EMAIL, 'mailgun'));

      registry.unregister(Channel.EMAIL, 'ses');

      const providers = registry.getProviders(Channel.EMAIL);
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.name)).toEqual(['sendgrid', 'mailgun']);
    });

    it('should promote the next provider to primary when primary is removed', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.register(createMockProvider(Channel.EMAIL, 'ses'));

      registry.unregister(Channel.EMAIL, 'sendgrid');

      const primary = registry.getProvider(Channel.EMAIL);
      expect(primary).toBeDefined();
      expect(primary!.name).toBe('ses');
    });

    it('should remove channel from getChannels when all providers are removed', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.unregister(Channel.EMAIL, 'sendgrid');

      const channels = registry.getChannels();
      expect(channels).not.toContain(Channel.EMAIL);
    });
  });
});
