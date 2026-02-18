import { Test, TestingModule } from '@nestjs/testing';
import { InAppProvider } from './in-app.provider';
import {
  Channel,
  ProviderStatus,
  InAppMessage,
} from '../../core';

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
    it('should have correct channel type', () => {
      expect(provider.channel).toBe(Channel.IN_APP);
    });
  });

  describe('name', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('notiflo-in-app');
    });
  });

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-123',
        title: 'Welcome!',
        body: 'Welcome to our platform',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toBeTruthy();
      expect(result.providerName).toBe('notiflo-in-app');
      expect(result.channel).toBe(Channel.IN_APP);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
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

    it('should store multiple messages', async () => {
      const msg1: InAppMessage = {
        subscriberId: 'user-1',
        title: 'First',
        body: 'First notification',
      };
      const msg2: InAppMessage = {
        subscriberId: 'user-2',
        title: 'Second',
        body: 'Second notification',
      };

      await provider.send(msg1);
      await provider.send(msg2);

      const stored = provider.getStoredMessages();
      expect(stored).toHaveLength(2);
    });

    it('should include provider-specific metadata in result', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-789',
        title: 'Alert',
        body: 'Alert body',
        data: { priority: 'high' },
      };

      const result = await provider.send(message);

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('subscriberId', 'user-789');
    });

    it('should handle send failures gracefully', async () => {
      const message: InAppMessage = {
        subscriberId: '',
        title: '',
        body: '',
      };

      const result = await provider.send(message);

      expect(result).toBeDefined();
      expect(result.providerName).toBe('notiflo-in-app');
      expect(result.channel).toBe(Channel.IN_APP);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate unique message IDs for each send', async () => {
      const message: InAppMessage = {
        subscriberId: 'user-1',
        title: 'Test',
        body: 'Test body',
      };

      const result1 = await provider.send(message);
      const result2 = await provider.send(message);

      expect(result1.messageId).toBeDefined();
      expect(result2.messageId).toBeDefined();
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
  });

  describe('validateConfig', () => {
    it('should validate config correctly when configured', async () => {
      const isValid = await provider.validateConfig();
      // In-app provider is always valid since it uses in-memory storage
      expect(isValid).toBe(true);
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
