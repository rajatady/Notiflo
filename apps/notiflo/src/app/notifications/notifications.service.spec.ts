import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationStatus, Channel } from '../core';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationModel: any;

  const createTestNotification = (overrides = {}) => ({
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    channel: Channel.EMAIL,
    provider: 'sendgrid',
    content: { subject: 'Welcome', body: 'Hello there' },
    ...overrides,
  });

  beforeEach(async () => {
    notificationModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
      deleteMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken('Notification'),
          useValue: notificationModel,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('create', () => {
    it('should create a notification record', async () => {
      const mockResult = {
        _id: 'notif-id-1',
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        channel: Channel.EMAIL,
        provider: 'sendgrid',
        status: NotificationStatus.PENDING,
        content: { subject: 'Welcome', body: 'Hello there' },
      };
      notificationModel.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(createTestNotification());

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-1');
      expect(result.subscriberId).toBe('sub-1');
      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.provider).toBe('sendgrid');
      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.content).toEqual({ subject: 'Welcome', body: 'Hello there' });
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.PENDING,
        }),
      );
    });

    it('should create a notification with optional fields', async () => {
      const mockResult = {
        _id: 'notif-id-2',
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        channel: Channel.EMAIL,
        provider: 'sendgrid',
        templateId: 'tpl-1',
        campaignId: 'camp-1',
        workflowId: 'wf-1',
        workflowExecutionId: 'wfe-1',
        metadata: { priority: 'high' },
        status: NotificationStatus.PENDING,
        content: { subject: 'Welcome', body: 'Hello there' },
      };
      notificationModel.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(
        createTestNotification({
          templateId: 'tpl-1',
          campaignId: 'camp-1',
          workflowId: 'wf-1',
          workflowExecutionId: 'wfe-1',
          metadata: { priority: 'high' },
        }),
      );

      expect(result.templateId).toBe('tpl-1');
      expect(result.campaignId).toBe('camp-1');
      expect(result.workflowId).toBe('wf-1');
      expect(result.workflowExecutionId).toBe('wfe-1');
      expect(result.metadata).toEqual({ priority: 'high' });
    });
  });

  describe('findOne', () => {
    it('should find notification by id', async () => {
      const mockNotification = {
        _id: 'notif-id-1',
        organizationId: 'org-1',
        channel: Channel.EMAIL,
      };
      notificationModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockNotification),
      });

      const found = await service.findOne('notif-id-1');

      expect(found).toBeDefined();
      expect(found.organizationId).toBe('org-1');
      expect(found.channel).toBe(Channel.EMAIL);
    });

    it('should return null for non-existent id', async () => {
      notificationModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findOne('507f1f77bcf86cd799439011');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find notifications by organizationId', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1' },
        { _id: 'n2', organizationId: 'org-1' },
        { _id: 'n3', organizationId: 'org-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll({ organizationId: 'org-1' });

      expect(results).toHaveLength(3);
      results.forEach((n) => expect(n.organizationId).toBe('org-1'));
    });

    it('should find notifications by subscriberId', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1', subscriberId: 'sub-1' },
        { _id: 'n2', organizationId: 'org-1', subscriberId: 'sub-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll({
        organizationId: 'org-1',
        subscriberId: 'sub-1',
      });

      expect(notificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ subscriberId: 'sub-1' }),
      );
      expect(results).toHaveLength(2);
      results.forEach((n) => expect(n.subscriberId).toBe('sub-1'));
    });

    it('should find notifications by channel', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1', channel: Channel.EMAIL },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll({
        organizationId: 'org-1',
        channel: Channel.EMAIL,
      });

      expect(notificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ channel: Channel.EMAIL }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].channel).toBe(Channel.EMAIL);
    });

    it('should find notifications by campaign', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1', campaignId: 'camp-1' },
        { _id: 'n2', organizationId: 'org-1', campaignId: 'camp-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll({
        organizationId: 'org-1',
        campaignId: 'camp-1',
      });

      expect(notificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: 'camp-1' }),
      );
      expect(results).toHaveLength(2);
      results.forEach((n) => expect(n.campaignId).toBe('camp-1'));
    });

    it('should paginate results', async () => {
      const mockResults = [
        { _id: 'n1', organizationId: 'org-1' },
        { _id: 'n2', organizationId: 'org-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const page1 = await service.findAll({
        organizationId: 'org-1',
        limit: 2,
        offset: 0,
      });

      expect(mockChain.skip).toHaveBeenCalledWith(0);
      expect(mockChain.limit).toHaveBeenCalledWith(2);
      expect(page1).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const futureDate = new Date(Date.now() + 60000);

      const mockResults = [
        { _id: 'n1', organizationId: 'org-1' },
        { _id: 'n2', organizationId: 'org-1' },
        { _id: 'n3', organizationId: 'org-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      };
      notificationModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll({
        organizationId: 'org-1',
        from: pastDate,
        to: futureDate,
      });

      expect(notificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: { $gte: pastDate, $lte: futureDate },
        }),
      );
      expect(results).toHaveLength(3);
    });
  });

  describe('updateStatus', () => {
    it('should update notification status', async () => {
      // updateStatus calls findById internally for SENT status check
      notificationModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.PENDING,
        }),
      });
      notificationModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.SENDING,
        }),
      });

      const updated = await service.updateStatus(
        'notif-id-1',
        NotificationStatus.SENDING,
      );

      expect(updated.status).toBe(NotificationStatus.SENDING);
    });

    it('should record sentAt timestamp when status changes to SENT', async () => {
      const sentAt = new Date();
      notificationModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.PENDING,
          sentAt: undefined,
        }),
      });
      notificationModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.SENT,
          sentAt,
        }),
      });

      const updated = await service.updateStatus(
        'notif-id-1',
        NotificationStatus.SENT,
      );

      expect(updated.status).toBe(NotificationStatus.SENT);
      expect(updated.sentAt).toBeDefined();
      // Verify that sentAt was included in the update
      expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'notif-id-1',
        expect.objectContaining({ sentAt: expect.any(Date) }),
        { new: true },
      );
    });

    it('should record deliveredAt timestamp when status changes to DELIVERED', async () => {
      notificationModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        }),
      });

      const updated = await service.updateStatus(
        'notif-id-1',
        NotificationStatus.DELIVERED,
      );

      expect(updated.status).toBe(NotificationStatus.DELIVERED);
      expect(updated.deliveredAt).toBeDefined();
      expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'notif-id-1',
        expect.objectContaining({ deliveredAt: expect.any(Date) }),
        { new: true },
      );
    });

    it('should not overwrite sentAt on subsequent status changes', async () => {
      const originalSentAt = new Date('2025-01-01T00:00:00Z');

      // When status is SENT, service calls findById to check existing sentAt
      notificationModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.SENT,
          sentAt: originalSentAt, // already has sentAt
        }),
      });
      notificationModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({
          _id: 'notif-id-1',
          status: NotificationStatus.SENT,
          sentAt: originalSentAt,
        }),
      });

      await service.updateStatus('notif-id-1', NotificationStatus.SENT);

      // Since sentAt already existed, the update should NOT include sentAt
      expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'notif-id-1',
        { status: NotificationStatus.SENT },
        { new: true },
      );
    });
  });

  describe('getStats', () => {
    it('should calculate notification stats for an organization', async () => {
      const mockAggResult = [
        {
          total: [{ count: 3 }],
          byStatus: [
            { _id: NotificationStatus.PENDING, count: 1 },
            { _id: NotificationStatus.SENT, count: 1 },
            { _id: NotificationStatus.DELIVERED, count: 1 },
          ],
          byChannel: [
            { _id: Channel.EMAIL, count: 2 },
            { _id: Channel.SMS, count: 1 },
          ],
        },
      ];
      notificationModel.aggregate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockAggResult),
      });

      const stats = await service.getStats('org-1');

      expect(stats).toBeDefined();
      expect(stats.total).toBe(3);
      expect(stats.byStatus[NotificationStatus.PENDING]).toBe(1);
      expect(stats.byStatus[NotificationStatus.SENT]).toBe(1);
      expect(stats.byStatus[NotificationStatus.DELIVERED]).toBe(1);
      expect(stats.byChannel[Channel.EMAIL]).toBe(2);
      expect(stats.byChannel[Channel.SMS]).toBe(1);
    });

    it('should return zero stats for org with no notifications', async () => {
      const mockAggResult = [
        {
          total: [],
          byStatus: [],
          byChannel: [],
        },
      ];
      notificationModel.aggregate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockAggResult),
      });

      const stats = await service.getStats('org-nonexistent');

      expect(stats).toBeDefined();
      expect(stats.total).toBe(0);
    });
  });
});
