import { Test, TestingModule } from '@nestjs/testing';
import { SmsProvider } from './sms.provider';
import { Channel, ProviderStatus, SmsMessage } from '../../core';

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
    it('should have correct channel property', () => {
      expect(provider.channel).toBe(Channel.SMS);
    });
  });

  describe('send', () => {
    it('should return success with messageId', async () => {
      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Hello from Notiflo!',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('twilio-');
      expect(result.providerName).toBe('twilio');
      expect(result.channel).toBe(Channel.SMS);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return failure on error', async () => {
      jest
        .spyOn(provider as any, 'doSend')
        .mockRejectedValue(new Error('SMS gateway timeout'));

      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Test message',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
      expect(result.error).toBe('SMS gateway timeout');
      expect(result.providerName).toBe('twilio');
      expect(result.channel).toBe(Channel.SMS);
      expect(result.timestamp).toBeInstanceOf(Date);
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
      expect(result.metadata).toHaveProperty('from', '+0987654321');
      expect(result.metadata).toHaveProperty('bodyLength', 12);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: SmsMessage = {
        to: '+1234567890',
        body: 'Test',
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
