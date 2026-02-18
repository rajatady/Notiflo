import { Test, TestingModule } from '@nestjs/testing';
import { PushProvider } from './push.provider';
import {
  Channel,
  ProviderStatus,
  PushMessage,
} from '../../core';

describe('PushProvider', () => {
  let provider: PushProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PushProvider],
    }).compile();

    provider = module.get<PushProvider>(PushProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('channel', () => {
    it('should have correct channel type', () => {
      expect(provider.channel).toBe(Channel.PUSH);
    });
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('firebase');
    });
  });

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message: PushMessage = {
        title: 'New Notification',
        body: 'You have a new message',
        tokens: ['device-token-123', 'device-token-456'],
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toBeTruthy();
      expect(result.providerName).toBe('firebase');
      expect(result.channel).toBe(Channel.PUSH);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should include provider-specific metadata in result', async () => {
      const message: PushMessage = {
        title: 'Alert',
        body: 'Something happened',
        tokens: ['token-1'],
        data: { action: 'open_screen', screenId: '42' },
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('title', 'Alert');
      expect(result.metadata).toHaveProperty('tokenCount', 1);
    });

    it('should handle send failures gracefully', async () => {
      const message: PushMessage = {
        title: '',
        body: '',
        tokens: [],
      };

      const result = await provider.send(message);

      expect(result).toBeDefined();
      expect(result.providerName).toBe('firebase');
      expect(result.channel).toBe(Channel.PUSH);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: PushMessage = {
        title: 'Test',
        body: 'Test body',
        tokens: ['token-1'],
      };

      const result1 = await provider.send(message);
      const result2 = await provider.send(message);

      expect(result1.messageId).toBeDefined();
      expect(result2.messageId).toBeDefined();
      expect(result1.messageId).not.toBe(result2.messageId);
    });
  });

  describe('validateConfig', () => {
    it('should validate config correctly when configured', async () => {
      const isValid = await provider.validateConfig();
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('getStatus', () => {
    it('should report status correctly', () => {
      const status = provider.getStatus();
      expect(Object.values(ProviderStatus)).toContain(status);
    });

    it('should return ACTIVE status when properly configured', () => {
      const status = provider.getStatus();
      expect(status).toBe(ProviderStatus.ACTIVE);
    });
  });
});
