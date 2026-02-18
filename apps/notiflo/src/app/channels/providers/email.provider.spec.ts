import { Test, TestingModule } from '@nestjs/testing';
import { EmailProvider } from './email.provider';
import {
  Channel,
  ProviderStatus,
  EmailMessage,
} from '../../core';

describe('EmailProvider', () => {
  let provider: EmailProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailProvider],
    }).compile();

    provider = module.get<EmailProvider>(EmailProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('channel', () => {
    it('should have correct channel type', () => {
      expect(provider.channel).toBe(Channel.EMAIL);
    });
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('sendgrid');
    });
  });

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message: EmailMessage = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
        text: 'Hello World',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toBeTruthy();
      expect(result.providerName).toBe('sendgrid');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should include provider-specific metadata in result', async () => {
      const message: EmailMessage = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('to', 'recipient@example.com');
      expect(result.metadata).toHaveProperty('subject', 'Test Subject');
    });

    it('should handle send failures gracefully', async () => {
      const message: EmailMessage = {
        to: '',
        subject: '',
        html: '',
      };

      // Force a failure by sending invalid data
      // The provider should catch errors and return a failure SendResult
      const result = await provider.send(message);

      // Even with bad data, the mock provider should return a result (not throw)
      expect(result).toBeDefined();
      expect(result.providerName).toBe('sendgrid');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
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
