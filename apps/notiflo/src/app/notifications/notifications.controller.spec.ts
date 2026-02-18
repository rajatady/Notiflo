import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationStatus, Channel } from '../core';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: any;

  beforeEach(async () => {
    notificationsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
      getStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('GET /notifications', () => {
    it('should list notifications filtered by organizationId', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1', channel: Channel.EMAIL },
        { _id: 'n2', organizationId: 'org-1', channel: Channel.SMS },
      ];
      notificationsService.findAll.mockResolvedValueOnce(mockResults);

      const result = await controller.findAll('org-1');

      expect(result).toHaveLength(2);
      result.forEach((n: any) => expect(n.organizationId).toBe('org-1'));
    });

    it('should list notifications filtered by channel', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1', channel: Channel.EMAIL },
      ];
      notificationsService.findAll.mockResolvedValueOnce(mockResults);

      const result = await controller.findAll(
        'org-1',
        undefined,
        Channel.EMAIL,
      );

      expect(notificationsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          channel: Channel.EMAIL,
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe(Channel.EMAIL);
    });

    it('should support pagination', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1' },
      ];
      notificationsService.findAll.mockResolvedValueOnce(mockResults);

      const result = await controller.findAll(
        'org-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1',
        '0',
      );

      expect(notificationsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 1,
          offset: 0,
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /notifications/stats', () => {
    it('should get stats for an organization', async () => {
      const mockStats = {
        total: 3,
        byStatus: {
          [NotificationStatus.SENT]: 1,
          [NotificationStatus.DELIVERED]: 1,
          [NotificationStatus.PENDING]: 1,
        },
        byChannel: {
          [Channel.EMAIL]: 2,
          [Channel.SMS]: 1,
        },
      };
      notificationsService.getStats.mockResolvedValueOnce(mockStats);

      const result = await controller.getStats('org-1');

      expect(result.total).toBe(3);
      expect(result.byStatus[NotificationStatus.SENT]).toBe(1);
      expect(result.byStatus[NotificationStatus.DELIVERED]).toBe(1);
      expect(result.byStatus[NotificationStatus.PENDING]).toBe(1);
      expect(result.byChannel[Channel.EMAIL]).toBe(2);
      expect(result.byChannel[Channel.SMS]).toBe(1);
    });
  });

  describe('GET /notifications/:id', () => {
    it('should get a notification by id', async () => {
      const mockNotification = {
        _id: 'notif-id-1',
        organizationId: 'org-1',
        channel: Channel.EMAIL,
      };
      notificationsService.findOne.mockResolvedValueOnce(mockNotification);

      const result = await controller.findOne('notif-id-1');

      expect(result.organizationId).toBe('org-1');
      expect(result.channel).toBe(Channel.EMAIL);
    });

    it('should throw NotFoundException for non-existent notification', async () => {
      notificationsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /notifications/:id/status', () => {
    it('should update notification status', async () => {
      const mockUpdated = {
        _id: 'notif-id-1',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      };
      notificationsService.updateStatus.mockResolvedValueOnce(mockUpdated);

      const result = await controller.updateStatus('notif-id-1', {
        status: NotificationStatus.SENT,
      });

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.sentAt).toBeDefined();
    });

    it('should set deliveredAt when status is DELIVERED', async () => {
      const mockUpdated = {
        _id: 'notif-id-1',
        status: NotificationStatus.DELIVERED,
        deliveredAt: new Date(),
      };
      notificationsService.updateStatus.mockResolvedValueOnce(mockUpdated);

      const result = await controller.updateStatus('notif-id-1', {
        status: NotificationStatus.DELIVERED,
      });

      expect(result.status).toBe(NotificationStatus.DELIVERED);
      expect(result.deliveredAt).toBeDefined();
    });

    it('should throw NotFoundException for non-existent notification', async () => {
      notificationsService.updateStatus.mockResolvedValueOnce(null);

      await expect(
        controller.updateStatus('507f1f77bcf86cd799439011', {
          status: NotificationStatus.SENT,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
