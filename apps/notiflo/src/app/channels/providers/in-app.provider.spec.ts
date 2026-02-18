import { Test, TestingModule } from '@nestjs/testing';
import { InAppProvider } from './in-app.provider';
import { Channel, ProviderStatus, InAppMessage } from '../../core';

describe('InAppProvider', () => {
  let provider: InAppProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InAppProvider],
    }).compile();

    provider = module.get<InAppProvider>(InAppProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('channel', () => {
    it('should have correct channel property', () => {
      expect(provider.channel).toBe(Channel.IN_APP);
    });
  });

  describe('send', () => {
    it('should return success with messageId', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-123',
        title: 'Welcome!',
        body: 'Welcome to our platform',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('notiflo-in-app-');
      expect(result.providerName).toBe('notiflo-in-app');
      expect(result.channel).toBe(Channel.IN_APP);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should return failure on error', async () => {
      jest
        .spyOn(provider as any, 'doSend')
        .mockRejectedValue(new Error('Storage full'));

      const message: InAppMessage = {
        subscriberId: 'user-123',
        title: 'Test',
        body: 'Test body',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
      expect(result.error).toBe('Storage full');
      expect(result.providerName).toBe('notiflo-in-app');
      expect(result.channel).toBe(Channel.IN_APP);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include provider-specific metadata in result', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-789',
        title: 'Alert',
        body: 'Alert body',
        actionUrl: '/dashboard',
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('subscriberId', 'user-789');
      expect(result.metadata).toHaveProperty('hasActionUrl', true);
      expect(result.metadata).toHaveProperty('storedCount', 1);
    });

    it('should store messages in memory', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-456',
        title: 'Notification',
        body: 'You have a new notification',
        actionUrl: '/dashboard',
      };

      await provider.send(message);

      const stored = provider.getStoredMessages();
      expect(stored).toHaveLength(1);
      expect(stored[0].subscriberId).toBe('user-456');
      expect(stored[0].title).toBe('Notification');
    });

    it('should generate unique message IDs for each send', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-1',
        title: 'Test',
        body: 'Test body',
      };

      const result1 = await provider.send(message);
      const result2 = await provider.send(message);

      expect(result1.messageId).not.toBe(result2.messageId);
    });
  });

  describe('getStoredMessages', () => {
    it('should return empty array when no messages sent', () => {
      const stored = provider.getStoredMessages();
      expect(stored).toEqual([]);
    });

    it('should return stored messages for a specific subscriber', async () => {
      await provider.send({
        subscriberId: 'user-A',
        title: 'For A',
        body: 'Message for A',
      });
      await provider.send({
        subscriberId: 'user-B',
        title: 'For B',
        body: 'Message for B',
      });
      await provider.send({
        subscriberId: 'user-A',
        title: 'For A again',
        body: 'Another message for A',
      });

      const messagesForA = provider.getStoredMessagesForSubscriber('user-A');
      expect(messagesForA).toHaveLength(2);
      expect(messagesForA[0].title).toBe('For A');
      expect(messagesForA[1].title).toBe('For A again');
    });

    it('should clear stored messages', async () => {
      await provider.send({
        subscriberId: 'user-1',
        title: 'Test',
        body: 'Test body',
      });

      provider.clearStoredMessages();
      expect(provider.getStoredMessages()).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      const status = provider.getStatus();
      expect(status).toBe(ProviderStatus.ACTIVE);
    });
  });

  describe('validateConfig', () => {
    it('should return true since in-app uses in-memory storage', async () => {
      const isValid = await provider.validateConfig();
      expect(isValid).toBe(true);
    });
  });
});
