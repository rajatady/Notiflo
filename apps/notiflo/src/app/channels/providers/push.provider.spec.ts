import { Test, TestingModule } from '@nestjs/testing';
import { PushProvider } from './push.provider';
import { Channel, ProviderStatus, PushMessage } from '../../core';

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
    it('should have correct channel property', () => {
      expect(provider.channel).toBe(Channel.PUSH);
    });
  });

  describe('send', () => {
    it('should return success with messageId', async () => {
      const message: PushMessage = {
        title: 'New Notification',
        body: 'You have a new message',
        tokens: ['device-token-123', 'device-token-456'],
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('firebase-');
      expect(result.providerName).toBe('firebase');
      expect(result.channel).toBe(Channel.PUSH);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return failure on error', async () => {
      jest
        .spyOn(provider as any, 'doSend')
        .mockRejectedValue(new Error('FCM authentication failed'));

      const message: PushMessage = {
        title: 'Test',
        body: 'Test body',
        tokens: ['token-1'],
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
      expect(result.error).toBe('FCM authentication failed');
      expect(result.providerName).toBe('firebase');
      expect(result.channel).toBe(Channel.PUSH);
      expect(result.timestamp).toBeInstanceOf(Date);
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
      expect(result.metadata).toHaveProperty('hasData', true);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: PushMessage = {
        title: 'Test',
        body: 'Test body',
        tokens: ['token-1'],
      };

      const result1 = await provider.send(message);
      const result2 = await provider.send(message);

      expect(result1.messageId).not.toBe(result2.messageId);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      const status = provider.getStatus();
      expect(status).toBe(ProviderStatus.ACTIVE);
    });
  });

  describe('validateConfig', () => {
    it('should return true when configured', async () => {
      const isValid = await provider.validateConfig();
      expect(isValid).toBe(true);
    });
  });
});
