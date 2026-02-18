import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import {
  Channel,
  ProviderStatus,
  SendResult,
  EmailMessage,
  SmsMessage,
  IChannelProvider,
  IChannelRegistry,
  CHANNEL_REGISTRY,
  ChannelNotConfiguredError,
  ProviderNotFoundError,
  ProviderSendError,
} from '../core';

/**
 * Creates a mock provider for testing.
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

describe('ChannelsService', () => {
  let service: ChannelsService;
  let mockRegistry: jest.Mocked<IChannelRegistry>;

  beforeEach(async () => {
    mockRegistry = {
      register: jest.fn(),
      getProvider: jest.fn(),
      getProviders: jest.fn(),
      getChannels: jest.fn().mockReturnValue([]),
      hasActiveProvider: jest.fn().mockReturnValue(false),
      unregister: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: CHANNEL_REGISTRY,
          useValue: mockRegistry,
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('send', () => {
    it('should send via a specific channel using the primary provider', async () => {
      const mockProvider = createMockProvider(Channel.EMAIL, 'sendgrid');
      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      const result = await service.send(Channel.EMAIL, message);

      expect(result.success).toBe(true);
      expect(result.providerName).toBe('sendgrid');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(mockRegistry.getProvider).toHaveBeenCalledWith(
        Channel.EMAIL,
        undefined,
      );
      expect(mockProvider.send).toHaveBeenCalledWith(message);
    });

    it('should send via a specific provider name', async () => {
      const mockProvider = createMockProvider(Channel.EMAIL, 'ses');
      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      const result = await service.send(Channel.EMAIL, message, 'ses');

      expect(result.success).toBe(true);
      expect(result.providerName).toBe('ses');
      expect(mockRegistry.getProvider).toHaveBeenCalledWith(
        Channel.EMAIL,
        'ses',
      );
      expect(mockProvider.send).toHaveBeenCalledWith(message);
    });

    it('should fail gracefully when channel has no provider', async () => {
      mockRegistry.getProvider.mockReturnValue(undefined);

      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      await expect(service.send(Channel.EMAIL, message)).rejects.toThrow(
        ChannelNotConfiguredError,
      );
    });

    it('should fail gracefully when specific provider name is not found', async () => {
      mockRegistry.getProvider.mockReturnValue(undefined);

      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      await expect(
        service.send(Channel.EMAIL, message, 'nonexistent'),
      ).rejects.toThrow(ChannelNotConfiguredError);
    });

    it('should fail gracefully when provider send fails', async () => {
      const mockProvider = createMockProvider(Channel.SMS, 'twilio');
      (mockProvider.send as jest.Mock).mockRejectedValue(
        new Error('SMS gateway timeout'),
      );
      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Hello',
      };

      await expect(service.send(Channel.SMS, message)).rejects.toThrow(
        ProviderSendError,
      );
    });

    it('should wrap provider errors with ProviderSendError', async () => {
      const mockProvider = createMockProvider(Channel.EMAIL, 'sendgrid');
      (mockProvider.send as jest.Mock).mockRejectedValue(
        new Error('API rate limit exceeded'),
      );
      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      try {
        await service.send(Channel.EMAIL, message);
        fail('Should have thrown ProviderSendError');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderSendError);
        expect((error as ProviderSendError).message).toContain('sendgrid');
        expect((error as ProviderSendError).message).toContain(
          'API rate limit exceeded',
        );
      }
    });
  });

  describe('getAvailableChannels', () => {
    it('should list available channels with active providers', () => {
      mockRegistry.getChannels.mockReturnValue([
        Channel.EMAIL,
        Channel.SMS,
        Channel.PUSH,
      ]);
      mockRegistry.hasActiveProvider.mockImplementation((channel: Channel) => {
        return channel === Channel.EMAIL || channel === Channel.SMS;
      });

      const available = service.getAvailableChannels();

      expect(available).toHaveLength(2);
      expect(available).toContain(Channel.EMAIL);
      expect(available).toContain(Channel.SMS);
      expect(available).not.toContain(Channel.PUSH);
    });

    it('should return empty array when no channels have active providers', () => {
      mockRegistry.getChannels.mockReturnValue([Channel.EMAIL]);
      mockRegistry.hasActiveProvider.mockReturnValue(false);

      const available = service.getAvailableChannels();

      expect(available).toEqual([]);
    });

    it('should return empty array when no channels are registered', () => {
      mockRegistry.getChannels.mockReturnValue([]);

      const available = service.getAvailableChannels();

      expect(available).toEqual([]);
    });

    it('should return all channels when all have active providers', () => {
      const allChannels = [
        Channel.EMAIL,
        Channel.SMS,
        Channel.PUSH,
        Channel.IN_APP,
        Channel.WEBHOOK,
      ];
      mockRegistry.getChannels.mockReturnValue(allChannels);
      mockRegistry.hasActiveProvider.mockReturnValue(true);

      const available = service.getAvailableChannels();

      expect(available).toHaveLength(5);
      expect(available).toEqual(expect.arrayContaining(allChannels));
    });
  });
});
