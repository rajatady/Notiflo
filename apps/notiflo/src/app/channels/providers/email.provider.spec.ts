import { Test, TestingModule } from '@nestjs/testing';
import { EmailProvider } from './email.provider';
import { Channel, ProviderStatus, EmailMessage } from '../../core';

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
    it('should have correct channel property', () => {
      expect(provider.channel).toBe(Channel.EMAIL);
    });
  });

  describe('send', () => {
    it('should return success with messageId', async () => {
      const message: EmailMessage = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
        text: 'Hello World',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('sendgrid-');
      expect(result.providerName).toBe('sendgrid');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return failure on error', async () => {
      // Spy on the protected doSend to force a throw
      jest
        .spyOn(provider as any, 'doSend')
        .mockRejectedValue(new Error('SMTP connection refused'));

      const message: EmailMessage = {
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
      expect(result.error).toBe('SMTP connection refused');
      expect(result.providerName).toBe('sendgrid');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.timestamp).toBeInstanceOf(Date);
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

    it('should use default fromAddress when from is not provided', async () => {
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
      };

      const result = await provider.send(message);

      expect(result.metadata).toHaveProperty('from', 'noreply@notiflo.io');
    });

    it('should use provided from address when specified', async () => {
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello',
        from: 'custom@example.com',
      };

      const result = await provider.send(message);

      expect(result.metadata).toHaveProperty('from', 'custom@example.com');
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
