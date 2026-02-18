import { Test, TestingModule } from '@nestjs/testing';
import { ChannelRegistryService } from './channel-registry.service';
import {
  Channel,
  ProviderStatus,
  SendResult,
  IChannelProvider,
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

  describe('register and retrieve provider', () => {
    it('should register a provider and retrieve it by channel', () => {
      const provider = createMockProvider(Channel.EMAIL, 'sendgrid');
      registry.register(provider);

      const retrieved = registry.getProvider(Channel.EMAIL);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('sendgrid');
      expect(retrieved!.channel).toBe(Channel.EMAIL);
    });

    it('should register providers across different channels', () => {
      const emailProvider = createMockProvider(Channel.EMAIL, 'sendgrid');
      const smsProvider = createMockProvider(Channel.SMS, 'twilio');

      registry.register(emailProvider);
      registry.register(smsProvider);

      expect(registry.getProvider(Channel.EMAIL)!.name).toBe('sendgrid');
      expect(registry.getProvider(Channel.SMS)!.name).toBe('twilio');
    });

    it('should retrieve a specific provider by name', () => {
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
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));

      const result = registry.getProvider(Channel.EMAIL, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getProvider returns primary (first registered)', () => {
    it('should return the first registered provider as primary', () => {
      const primary = createMockProvider(Channel.EMAIL, 'sendgrid');
      const secondary = createMockProvider(Channel.EMAIL, 'ses');

      registry.register(primary);
      registry.register(secondary);

      const retrieved = registry.getProvider(Channel.EMAIL);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('sendgrid');
    });

    it('should promote next provider to primary when first is removed', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.register(createMockProvider(Channel.EMAIL, 'ses'));

      registry.unregister(Channel.EMAIL, 'sendgrid');

      const primary = registry.getProvider(Channel.EMAIL);
      expect(primary).toBeDefined();
      expect(primary!.name).toBe('ses');
    });
  });

  describe('getProviders returns all for channel', () => {
    it('should return all providers for a channel', () => {
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

  describe('hasActiveProvider checks correctly', () => {
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
        createMockProvider(
          Channel.EMAIL,
          'sendgrid',
          ProviderStatus.INACTIVE,
        ),
      );
      registry.register(
        createMockProvider(Channel.EMAIL, 'ses', ProviderStatus.ERROR),
      );

      expect(registry.hasActiveProvider(Channel.EMAIL)).toBe(false);
    });

    it('should return true when at least one provider is active among inactive ones', () => {
      registry.register(
        createMockProvider(
          Channel.EMAIL,
          'sendgrid',
          ProviderStatus.INACTIVE,
        ),
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

    it('should only consider ACTIVE status as active (not RATE_LIMITED)', () => {
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

  describe('unregister removes provider', () => {
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

    it('should remove channel from getChannels when all providers are removed', () => {
      registry.register(createMockProvider(Channel.EMAIL, 'sendgrid'));
      registry.unregister(Channel.EMAIL, 'sendgrid');

      const channels = registry.getChannels();
      expect(channels).not.toContain(Channel.EMAIL);
    });
  });
});
