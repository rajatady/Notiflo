import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './schemas/campaign.schema';
import { CampaignStatus } from '../core/types/campaign.types';
import { Channel } from '../core/types/channel.types';
import {
  CampaignNotFoundError,
  CampaignStatusError,
} from '../core/errors/notiflo.errors';
import { CreateCampaignDto } from './dto/create-campaign.dto';

/**
 * Helper: creates a mock Mongoose document with toObject(), save(), deleteOne().
 * The underlying data object is mutable so state transitions work.
 */
function createMockDoc(data: Record<string, any>) {
  const doc: any = { ...data };

  doc.toObject = jest.fn(() => {
    const obj = { ...doc };
    delete obj.toObject;
    delete obj.save;
    delete obj.deleteOne;
    return obj;
  });

  doc.save = jest.fn(async () => {
    return doc;
  });

  doc.deleteOne = jest.fn(async () => {
    return { deletedCount: 1 };
  });

  return doc;
}

describe('CampaignsService', () => {
  let service: CampaignsService;
  let campaignModel: any;

  const baseCampaignDto: CreateCampaignDto = {
    organizationId: 'org-123',
    name: 'Test Campaign',
    description: 'A test campaign',
    channels: [Channel.EMAIL, Channel.SMS],
    templateIds: { [Channel.EMAIL]: 'tpl-email-1', [Channel.SMS]: 'tpl-sms-1' },
    targetSegment: {
      filters: [{ field: 'country', operator: 'eq' as const, value: 'US' }],
      logic: 'and' as const,
    },
    tags: ['promo', 'q1'],
    createdBy: 'user-1',
  };

  beforeEach(async () => {
    campaignModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        {
          provide: getModelToken(Campaign.name),
          useValue: campaignModel,
        },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  // ---------- CREATE ----------
  describe('create', () => {
    it('should create a campaign in DRAFT status', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
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
      });
      campaignModel.create.mockResolvedValueOnce(mockDoc);

      const campaign = await service.create(baseCampaignDto);

      expect(campaign).toBeDefined();
      expect(campaign.id).toBeDefined();
      expect(campaign.organizationId).toBe('org-123');
      expect(campaign.name).toBe('Test Campaign');
      expect(campaign.description).toBe('A test campaign');
      expect(campaign.channels).toEqual([Channel.EMAIL, Channel.SMS]);
      expect(campaign.status).toBe(CampaignStatus.DRAFT);
      expect(campaign.createdBy).toBe('user-1');
      expect(campaign.tags).toEqual(['promo', 'q1']);
      expect(campaign.analytics).toBeDefined();
      expect(campaign.analytics.totalRecipients).toBe(0);
      expect(campaign.analytics.sent).toBe(0);
      expect(campaign.analytics.delivered).toBe(0);
      expect(campaign.analytics.failed).toBe(0);
      expect(campaign.analytics.opened).toBe(0);
      expect(campaign.analytics.clicked).toBe(0);
      expect(campaign.analytics.bounced).toBe(0);
      expect(campaign.analytics.unsubscribed).toBe(0);
    });
  });

  // ---------- FIND ----------
  describe('findOne', () => {
    it('should find a campaign by id', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
        analytics: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const found = await service.findOne('campaign-id-1');

      expect(found).toBeDefined();
      expect(found.id).toBe('campaign-id-1');
      expect(found.name).toBe('Test Campaign');
    });

    it('should throw CampaignNotFoundError for non-existent id', async () => {
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      await expect(service.findOne('aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  describe('findAll', () => {
    it('should find all campaigns for an organization', async () => {
      const mockDocs = [
        createMockDoc({ _id: 'c1', organizationId: 'org-find-all', name: 'First', status: CampaignStatus.DRAFT }),
        createMockDoc({ _id: 'c2', organizationId: 'org-find-all', name: 'Second', status: CampaignStatus.DRAFT }),
      ];
      const mockChain = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockDocs),
      };
      campaignModel.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll('org-find-all');

      expect(results.length).toBe(2);
      results.forEach((c) => expect(c.organizationId).toBe('org-find-all'));
    });

    it('should support filtering by status', async () => {
      const mockDocs = [
        createMockDoc({ _id: 'c1', organizationId: 'org-find-status', name: 'Campaign', status: CampaignStatus.PENDING_APPROVAL }),
      ];
      const mockChain = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockDocs),
      };
      campaignModel.find.mockReturnValueOnce(mockChain);

      const pending = await service.findAll('org-find-status', CampaignStatus.PENDING_APPROVAL);

      expect(campaignModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: CampaignStatus.PENDING_APPROVAL }),
      );
      expect(pending.length).toBe(1);
    });
  });

  // ---------- UPDATE ----------
  describe('update', () => {
    it('should update a draft campaign', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
        analytics: { totalRecipients: 0, sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const updated = await service.update('campaign-id-1', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(mockDoc.save).toHaveBeenCalled();
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
    });

    it('should NOT update a running campaign core fields (name, channels, templates)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.RUNNING,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(
        service.update('campaign-id-1', { name: 'Hacked Name' }),
      ).rejects.toThrow(CampaignStatusError);
    });
  });

  // ---------- STATE TRANSITIONS ----------
  describe('submitForApproval', () => {
    it('should transition DRAFT -> PENDING_APPROVAL', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const submitted = await service.submitForApproval('campaign-id-1');

      expect(mockDoc.save).toHaveBeenCalled();
      expect(submitted.status).toBe(CampaignStatus.PENDING_APPROVAL);
    });
  });

  describe('approve', () => {
    it('should approve a campaign (PENDING_APPROVAL -> APPROVED, records approver + timestamp)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.PENDING_APPROVAL,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const approved = await service.approve('campaign-id-1', 'admin-42');

      expect(mockDoc.save).toHaveBeenCalled();
      expect(approved.status).toBe(CampaignStatus.APPROVED);
      expect(approved.approvedBy).toBe('admin-42');
      expect(approved.approvedAt).toBeDefined();
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should NOT approve a draft campaign (invalid transition)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(
        service.approve('campaign-id-1', 'admin-1'),
      ).rejects.toThrow(CampaignStatusError);
    });
  });

  describe('reject', () => {
    it('should reject a campaign with reason (PENDING_APPROVAL -> REJECTED)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.PENDING_APPROVAL,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const rejected = await service.reject('campaign-id-1', 'admin-42', 'Inappropriate content');

      expect(mockDoc.save).toHaveBeenCalled();
      expect(rejected.status).toBe(CampaignStatus.REJECTED);
      expect(rejected.rejectedBy).toBe('admin-42');
      expect(rejected.rejectedAt).toBeDefined();
      expect(rejected.rejectedAt).toBeInstanceOf(Date);
      expect(rejected.rejectionReason).toBe('Inappropriate content');
    });
  });

  describe('schedule', () => {
    it('should schedule an approved campaign (APPROVED -> SCHEDULED)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.APPROVED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const schedule = {
        type: 'scheduled' as const,
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
        timezone: 'UTC',
      };
      const scheduled = await service.schedule('campaign-id-1', schedule);

      expect(mockDoc.save).toHaveBeenCalled();
      expect(scheduled.status).toBe(CampaignStatus.SCHEDULED);
      expect(scheduled.schedule).toBeDefined();
      expect(scheduled.schedule.type).toBe('scheduled');
      expect(scheduled.schedule.timezone).toBe('UTC');
    });
  });

  describe('start', () => {
    it('should start a campaign from SCHEDULED (SCHEDULED -> RUNNING)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.SCHEDULED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const started = await service.start('campaign-id-1');
      expect(started.status).toBe(CampaignStatus.RUNNING);
    });

    it('should start a campaign from APPROVED (APPROVED -> RUNNING)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.APPROVED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const started = await service.start('campaign-id-1');
      expect(started.status).toBe(CampaignStatus.RUNNING);
    });

    it('should NOT start a rejected campaign (invalid transition)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.REJECTED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(service.start('campaign-id-1')).rejects.toThrow(CampaignStatusError);
    });
  });

  describe('pause', () => {
    it('should pause a running campaign (RUNNING -> PAUSED)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.RUNNING,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const paused = await service.pause('campaign-id-1');
      expect(paused.status).toBe(CampaignStatus.PAUSED);
    });
  });

  describe('resume', () => {
    it('should resume a paused campaign (PAUSED -> RUNNING)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.PAUSED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const resumed = await service.resume('campaign-id-1');
      expect(resumed.status).toBe(CampaignStatus.RUNNING);
    });
  });

  describe('complete', () => {
    it('should complete a running campaign (RUNNING -> COMPLETED)', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.RUNNING,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const completed = await service.complete('campaign-id-1');
      expect(completed.status).toBe(CampaignStatus.COMPLETED);
    });
  });

  describe('cancel', () => {
    it('should cancel a campaign from APPROVED status -> CANCELLED', async () => {
      const mockDoc = createMockDoc({
        _id: 'c1',
        ...baseCampaignDto,
        status: CampaignStatus.APPROVED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const cancelled = await service.cancel('c1');
      expect(cancelled.status).toBe(CampaignStatus.CANCELLED);
    });

    it('should cancel a campaign from RUNNING status -> CANCELLED', async () => {
      const mockDoc = createMockDoc({
        _id: 'c2',
        ...baseCampaignDto,
        status: CampaignStatus.RUNNING,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const cancelled = await service.cancel('c2');
      expect(cancelled.status).toBe(CampaignStatus.CANCELLED);
    });

    it('should cancel a campaign from PAUSED status -> CANCELLED', async () => {
      const mockDoc = createMockDoc({
        _id: 'c3',
        ...baseCampaignDto,
        status: CampaignStatus.PAUSED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const cancelled = await service.cancel('c3');
      expect(cancelled.status).toBe(CampaignStatus.CANCELLED);
    });

    it('should cancel a campaign from SCHEDULED status -> CANCELLED', async () => {
      const mockDoc = createMockDoc({
        _id: 'c4',
        ...baseCampaignDto,
        status: CampaignStatus.SCHEDULED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const cancelled = await service.cancel('c4');
      expect(cancelled.status).toBe(CampaignStatus.CANCELLED);
    });

    it('should NOT cancel an already completed campaign', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.COMPLETED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(service.cancel('campaign-id-1')).rejects.toThrow(CampaignStatusError);
    });

    it('should NOT cancel an already cancelled campaign', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.CANCELLED,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(service.cancel('campaign-id-1')).rejects.toThrow(CampaignStatusError);
    });
  });

  // ---------- ANALYTICS ----------
  describe('updateAnalytics', () => {
    it('should update campaign analytics by incrementing fields', async () => {
      const mockUpdatedDoc = createMockDoc({
        _id: 'campaign-id-1',
        analytics: {
          totalRecipients: 100,
          sent: 50,
          delivered: 40,
          failed: 0,
          opened: 20,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
        },
      });
      campaignModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdatedDoc),
      });

      const updated = await service.updateAnalytics('campaign-id-1', {
        totalRecipients: 100,
        sent: 50,
        delivered: 40,
        opened: 20,
      });

      expect(campaignModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'campaign-id-1',
        {
          $inc: {
            'analytics.totalRecipients': 100,
            'analytics.sent': 50,
            'analytics.delivered': 40,
            'analytics.opened': 20,
          },
        },
        { new: true },
      );
      expect(updated.analytics.totalRecipients).toBe(100);
      expect(updated.analytics.sent).toBe(50);
      expect(updated.analytics.delivered).toBe(40);
      expect(updated.analytics.opened).toBe(20);
      expect(updated.analytics.failed).toBe(0);
    });
  });

  describe('getAnalytics', () => {
    it('should return campaign analytics', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        analytics: { totalRecipients: 200, sent: 150, delivered: 0, failed: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      const analytics = await service.getAnalytics('campaign-id-1');
      expect(analytics.totalRecipients).toBe(200);
      expect(analytics.sent).toBe(150);
      expect(analytics.delivered).toBe(0);
    });
  });

  // ---------- QUERY HELPERS ----------
  describe('findByStatus', () => {
    it('should find campaigns by status', async () => {
      const mockDocs = [
        createMockDoc({ _id: 'c2', organizationId: 'org-by-status', name: 'Draft Campaign', status: CampaignStatus.DRAFT }),
      ];
      campaignModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDocs),
      });

      const drafts = await service.findByStatus('org-by-status', CampaignStatus.DRAFT);

      expect(campaignModel.find).toHaveBeenCalledWith({
        organizationId: 'org-by-status',
        status: CampaignStatus.DRAFT,
      });
      expect(drafts.length).toBe(1);
    });
  });

  describe('findByTag', () => {
    it('should find campaigns by tag', async () => {
      const mockDocs = [
        createMockDoc({ _id: 'c1', organizationId: 'org-by-tag', tags: ['summer', 'sale'] }),
        createMockDoc({ _id: 'c3', organizationId: 'org-by-tag', tags: ['summer'] }),
      ];
      campaignModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDocs),
      });

      const summerCampaigns = await service.findByTag('org-by-tag', 'summer');

      expect(campaignModel.find).toHaveBeenCalledWith({
        organizationId: 'org-by-tag',
        tags: 'summer',
      });
      expect(summerCampaigns.length).toBe(2);
    });
  });

  // ---------- DELETE ----------
  describe('remove', () => {
    it('should delete only DRAFT campaigns', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.DRAFT,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await service.remove('campaign-id-1');

      expect(mockDoc.deleteOne).toHaveBeenCalled();
    });

    it('should NOT delete a non-DRAFT campaign', async () => {
      const mockDoc = createMockDoc({
        _id: 'campaign-id-1',
        ...baseCampaignDto,
        status: CampaignStatus.PENDING_APPROVAL,
      });
      campaignModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDoc),
      });

      await expect(service.remove('campaign-id-1')).rejects.toThrow(
        CampaignStatusError,
      );
    });
  });
});
