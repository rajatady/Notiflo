import { Test, TestingModule } from '@nestjs/testing';
import { WebhookProvider } from './webhook.provider';
import {
  Channel,
  ProviderStatus,
  WebhookMessage,
} from '../../core';

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
    it('should have correct channel type', () => {
      expect(provider.channel).toBe(Channel.WEBHOOK);
    });
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('webhook');
    });
  });

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message: WebhookMessage = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { event: 'notification.sent', data: { id: 1 } },
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toBeTruthy();
      expect(result.providerName).toBe('webhook');
      expect(result.channel).toBe(Channel.WEBHOOK);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should include provider-specific metadata in result', async () => {
      const message: WebhookMessage = {
        url: 'https://hooks.example.com/notify',
        method: 'POST',
        body: { type: 'alert' },
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('url', 'https://hooks.example.com/notify');
      expect(result.metadata).toHaveProperty('method', 'POST');
    });

    it('should handle send failures gracefully', async () => {
      const message: WebhookMessage = {
        url: '',
        method: 'POST',
      };

      const result = await provider.send(message);

      expect(result).toBeDefined();
      expect(result.providerName).toBe('webhook');
      expect(result.channel).toBe(Channel.WEBHOOK);
      expect(result.timestamp).toBeInstanceOf(Date);
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
