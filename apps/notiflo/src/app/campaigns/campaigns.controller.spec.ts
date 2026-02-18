import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignStatus } from '../core/types/campaign.types';
import { Channel } from '../core/types/channel.types';
import {
  CampaignNotFoundError,
  CampaignStatusError,
} from '../core/errors/notiflo.errors';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let service: jest.Mocked<CampaignsService>;

  const mockCampaign = {
    id: 'camp-1',
    organizationId: 'org-123',
    name: 'Test Campaign',
    description: 'A test campaign',
    channels: [Channel.EMAIL],
    templateIds: { [Channel.EMAIL]: 'tpl-1' },
    targetSegment: null,
    schedule: null,
    status: CampaignStatus.DRAFT,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    analytics: {
      totalRecipients: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
    },
    tags: ['promo'],
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockServiceFactory = () => ({
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    submitForApproval: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    schedule: jest.fn(),
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
    updateAnalytics: jest.fn(),
    findByStatus: jest.fn(),
    findByTag: jest.fn(),
    getAnalytics: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        {
          provide: CampaignsService,
          useFactory: mockServiceFactory,
        },
      ],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
    service = module.get(CampaignsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- POST / ----------
  describe('POST / (create)', () => {
    it('should create a campaign', async () => {
      const dto = {
        organizationId: 'org-123',
        name: 'Test Campaign',
        channels: [Channel.EMAIL],
        templateIds: { [Channel.EMAIL]: 'tpl-1' },
        createdBy: 'user-1',
      };
      service.create.mockResolvedValue(mockCampaign as any);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockCampaign);
    });
  });

  // ---------- GET / ----------
  describe('GET / (findAll)', () => {
    it('should list campaigns by organizationId', async () => {
      service.findAll.mockResolvedValue([mockCampaign] as any);

      const result = await controller.findAll('org-123');

      expect(service.findAll).toHaveBeenCalledWith('org-123', undefined, undefined, undefined);
      expect(result).toEqual([mockCampaign]);
    });

    it('should list campaigns filtered by status', async () => {
      service.findAll.mockResolvedValue([mockCampaign] as any);

      const result = await controller.findAll('org-123', CampaignStatus.DRAFT);

      expect(service.findAll).toHaveBeenCalledWith('org-123', CampaignStatus.DRAFT, undefined, undefined);
      expect(result).toEqual([mockCampaign]);
    });
  });

  // ---------- GET /:id ----------
  describe('GET /:id (findOne)', () => {
    it('should get a campaign by id', async () => {
      service.findOne.mockResolvedValue(mockCampaign as any);

      const result = await controller.findOne('camp-1');

      expect(service.findOne).toHaveBeenCalledWith('camp-1');
      expect(result).toEqual(mockCampaign);
    });
  });

  // ---------- PATCH /:id ----------
  describe('PATCH /:id (update)', () => {
    it('should update a campaign', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedCampaign = { ...mockCampaign, name: 'Updated Name' };
      service.update.mockResolvedValue(updatedCampaign as any);

      const result = await controller.update('camp-1', updateDto);

      expect(service.update).toHaveBeenCalledWith('camp-1', updateDto);
      expect(result.name).toBe('Updated Name');
    });
  });

  // ---------- DELETE /:id ----------
  describe('DELETE /:id (remove)', () => {
    it('should delete a draft campaign', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('camp-1');

      expect(service.remove).toHaveBeenCalledWith('camp-1');
    });
  });

  // ---------- POST /:id/submit ----------
  describe('POST /:id/submit (submitForApproval)', () => {
    it('should submit campaign for approval', async () => {
      const submitted = { ...mockCampaign, status: CampaignStatus.PENDING_APPROVAL };
      service.submitForApproval.mockResolvedValue(submitted as any);

      const result = await controller.submitForApproval('camp-1');

      expect(service.submitForApproval).toHaveBeenCalledWith('camp-1');
      expect(result.status).toBe(CampaignStatus.PENDING_APPROVAL);
    });
  });

  // ---------- POST /:id/approve ----------
  describe('POST /:id/approve (approve)', () => {
    it('should approve a campaign', async () => {
      const approved = {
        ...mockCampaign,
        status: CampaignStatus.APPROVED,
        approvedBy: 'admin-1',
        approvedAt: new Date(),
      };
      service.approve.mockResolvedValue(approved as any);

      const result = await controller.approve('camp-1', { approvedBy: 'admin-1' });

      expect(service.approve).toHaveBeenCalledWith('camp-1', 'admin-1');
      expect(result.status).toBe(CampaignStatus.APPROVED);
      expect(result.approvedBy).toBe('admin-1');
    });
  });

  // ---------- POST /:id/reject ----------
  describe('POST /:id/reject (reject)', () => {
    it('should reject a campaign with reason', async () => {
      const rejected = {
        ...mockCampaign,
        status: CampaignStatus.REJECTED,
        rejectedBy: 'admin-1',
        rejectedAt: new Date(),
        rejectionReason: 'Not compliant',
      };
      service.reject.mockResolvedValue(rejected as any);

      const result = await controller.reject('camp-1', {
        rejectedBy: 'admin-1',
        reason: 'Not compliant',
      });

      expect(service.reject).toHaveBeenCalledWith('camp-1', 'admin-1', 'Not compliant');
      expect(result.status).toBe(CampaignStatus.REJECTED);
      expect(result.rejectionReason).toBe('Not compliant');
    });
  });

  // ---------- POST /:id/schedule ----------
  describe('POST /:id/schedule (schedule)', () => {
    it('should schedule a campaign', async () => {
      const scheduleData = {
        type: 'scheduled' as const,
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
        timezone: 'UTC',
      };
      const scheduled = {
        ...mockCampaign,
        status: CampaignStatus.SCHEDULED,
        schedule: scheduleData,
      };
      service.schedule.mockResolvedValue(scheduled as any);

      const result = await controller.schedule('camp-1', { schedule: scheduleData });

      expect(service.schedule).toHaveBeenCalledWith('camp-1', scheduleData);
      expect(result.status).toBe(CampaignStatus.SCHEDULED);
    });
  });

  // ---------- POST /:id/start ----------
  describe('POST /:id/start (start)', () => {
    it('should start a campaign', async () => {
      const started = { ...mockCampaign, status: CampaignStatus.RUNNING };
      service.start.mockResolvedValue(started as any);

      const result = await controller.start('camp-1');

      expect(service.start).toHaveBeenCalledWith('camp-1');
      expect(result.status).toBe(CampaignStatus.RUNNING);
    });
  });

  // ---------- POST /:id/pause ----------
  describe('POST /:id/pause (pause)', () => {
    it('should pause a campaign', async () => {
      const paused = { ...mockCampaign, status: CampaignStatus.PAUSED };
      service.pause.mockResolvedValue(paused as any);

      const result = await controller.pause('camp-1');

      expect(service.pause).toHaveBeenCalledWith('camp-1');
      expect(result.status).toBe(CampaignStatus.PAUSED);
    });
  });

  // ---------- POST /:id/resume ----------
  describe('POST /:id/resume (resume)', () => {
    it('should resume a campaign', async () => {
      const resumed = { ...mockCampaign, status: CampaignStatus.RUNNING };
      service.resume.mockResolvedValue(resumed as any);

      const result = await controller.resume('camp-1');

      expect(service.resume).toHaveBeenCalledWith('camp-1');
      expect(result.status).toBe(CampaignStatus.RUNNING);
    });
  });

  // ---------- POST /:id/cancel ----------
  describe('POST /:id/cancel (cancel)', () => {
    it('should cancel a campaign', async () => {
      const cancelled = { ...mockCampaign, status: CampaignStatus.CANCELLED };
      service.cancel.mockResolvedValue(cancelled as any);

      const result = await controller.cancel('camp-1');

      expect(service.cancel).toHaveBeenCalledWith('camp-1');
      expect(result.status).toBe(CampaignStatus.CANCELLED);
    });
  });

  // ---------- GET /:id/analytics ----------
  describe('GET /:id/analytics (getAnalytics)', () => {
    it('should get campaign analytics', async () => {
      const analytics = {
        totalRecipients: 1000,
        sent: 950,
        delivered: 900,
        failed: 50,
        opened: 400,
        clicked: 100,
        bounced: 30,
        unsubscribed: 10,
      };
      service.getAnalytics.mockResolvedValue(analytics as any);

      const result = await controller.getAnalytics('camp-1');

      expect(service.getAnalytics).toHaveBeenCalledWith('camp-1');
      expect(result).toEqual(analytics);
    });
  });
});
