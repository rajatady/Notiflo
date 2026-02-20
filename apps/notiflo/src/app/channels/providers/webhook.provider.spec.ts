import { Test, TestingModule } from '@nestjs/testing';
import { WebhookProvider } from './webhook.provider';
import { Channel, ProviderStatus, WebhookMessage } from '../../core';

describe('WebhookProvider', () => {
  let provider: WebhookProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookProvider],
    }).compile();

    provider = module.get<WebhookProvider>(WebhookProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('channel', () => {
    it('should have correct channel property', () => {
      expect(provider.channel).toBe(Channel.WEBHOOK);
    });
  });

  describe('send', () => {
    it('should return success with messageId', async () => {
      const message: WebhookMessage = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { event: 'notification.sent', data: { id: 1 } },
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('webhook-');
      expect(result.providerName).toBe('webhook');
      expect(result.channel).toBe(Channel.WEBHOOK);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return failure on error', async () => {
      jest
        .spyOn(provider as any, 'doSend')
        .mockRejectedValue(new Error('Connection refused'));

      const message: WebhookMessage = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
      expect(result.error).toBe('Connection refused');
      expect(result.providerName).toBe('webhook');
      expect(result.channel).toBe(Channel.WEBHOOK);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include provider-specific metadata in result', async () => {
      const message: WebhookMessage = {
        url: 'https://hooks.example.com/notify',
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: { type: 'alert' },
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty(
        'url',
        'https://hooks.example.com/notify',
      );
      expect(result.metadata).toHaveProperty('method', 'POST');
      expect(result.metadata).toHaveProperty('hasBody', true);
      expect(result.metadata).toHaveProperty('headerCount', 1);
    });

    it('should support different HTTP methods', async () => {
      const getMessage = (method: 'GET' | 'POST' | 'PUT'): WebhookMessage => ({
        url: 'https://api.example.com/webhook',
        method,
      });

      const getResult = await provider.send(getMessage('GET'));
      const postResult = await provider.send(getMessage('POST'));
      const putResult = await provider.send(getMessage('PUT'));

      expect(getResult.success).toBe(true);
      expect(postResult.success).toBe(true);
      expect(putResult.success).toBe(true);

      expect(getResult.metadata).toHaveProperty('method', 'GET');
      expect(postResult.metadata).toHaveProperty('method', 'POST');
      expect(putResult.metadata).toHaveProperty('method', 'PUT');
    });

    it('should generate unique message IDs for each send', async () => {
      const message: WebhookMessage = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
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
    it('should return true since webhook config is per-message', async () => {
      const isValid = await provider.validateConfig();
      expect(isValid).toBe(true);
    });
  });
});
