import { Test, TestingModule } from '@nestjs/testing';
import { SmsProvider } from './sms.provider';
import {
  Channel,
  ProviderStatus,
  SmsMessage,
} from '../../core';

describe('SmsProvider', () => {
  let provider: SmsProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsProvider],
    }).compile();

    provider = module.get<SmsProvider>(SmsProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('channel', () => {
    it('should have correct channel type', () => {
      expect(provider.channel).toBe(Channel.SMS);
    });
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('twilio');
    });
  });

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Hello from Notiflo!',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toBeTruthy();
      expect(result.providerName).toBe('twilio');
      expect(result.channel).toBe(Channel.SMS);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should include provider-specific metadata in result', async () => {
      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Test message',
        from: '+0987654321',
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('to', '+1234567890');
    });

    it('should handle send failures gracefully', async () => {
      const message: SmsMessage = {
        to: '',
        body: '',
      };

      const result = await provider.send(message);

      expect(result).toBeDefined();
      expect(result.providerName).toBe('twilio');
      expect(result.channel).toBe(Channel.SMS);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Test',
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
