import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  CampaignStatus,
  CampaignAnalytics,
  CampaignSchedule,
  emptyCampaignAnalytics,
} from '../core/types/campaign.types';
import {
  CampaignNotFoundError,
  CampaignStatusError,
} from '../core/errors/notiflo.errors';

/** Terminal statuses from which no further transitions are allowed. */
const TERMINAL_STATUSES = new Set<string>([
  CampaignStatus.COMPLETED,
  CampaignStatus.CANCELLED,
]);

/**
 * Map of valid transitions: key = current status, value = set of allowed target statuses.
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [CampaignStatus.DRAFT]: new Set([CampaignStatus.PENDING_APPROVAL]),
  [CampaignStatus.PENDING_APPROVAL]: new Set([
    CampaignStatus.APPROVED,
    CampaignStatus.REJECTED,
  ]),
  [CampaignStatus.APPROVED]: new Set([
    CampaignStatus.SCHEDULED,
    CampaignStatus.RUNNING,
    CampaignStatus.CANCELLED,
  ]),
  [CampaignStatus.REJECTED]: new Set([CampaignStatus.DRAFT]),
  [CampaignStatus.SCHEDULED]: new Set([
    CampaignStatus.RUNNING,
    CampaignStatus.CANCELLED,
  ]),
  [CampaignStatus.RUNNING]: new Set([
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.CANCELLED,
  ]),
  [CampaignStatus.PAUSED]: new Set([
    CampaignStatus.RUNNING,
    CampaignStatus.CANCELLED,
  ]),
};

/** Statuses in which core campaign fields (name, channels, templateIds) can be edited. */
const EDITABLE_STATUSES = new Set<string>([
  CampaignStatus.DRAFT,
  CampaignStatus.REJECTED,
]);

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────

  private toCampaignView(doc: CampaignDocument): any {
    const obj: any = doc.toObject();
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
  }

  private async findDocOrThrow(id: string): Promise<CampaignDocument> {
    const doc = await this.campaignModel.findById(id).exec();
    if (!doc) {
      throw new CampaignNotFoundError(id);
    }
    return doc;
  }

  private assertTransition(
    campaignId: string,
    currentStatus: string,
    targetStatus: string,
  ): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.has(targetStatus)) {
      throw new CampaignStatusError(campaignId, currentStatus, targetStatus);
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────

  async create(dto: CreateCampaignDto) {
    const doc = await this.campaignModel.create({
      ...dto,
      status: CampaignStatus.DRAFT,
      analytics: { ...emptyCampaignAnalytics },
    });
    return this.toCampaignView(doc);
  }

  async findAll(
    organizationId: string,
    status?: CampaignStatus,
    limit?: number,
    offset?: number,
  ) {
    const filter: Record<string, unknown> = { organizationId };
    if (status) {
      filter.status = status;
    }
    let query = this.campaignModel.find(filter);
    if (offset) {
      query = query.skip(offset);
    }
    if (limit) {
      query = query.limit(limit);
    }
    const docs = await query.exec();
    return docs.map((d) => this.toCampaignView(d));
  }

  async findOne(id: string) {
    const doc = await this.findDocOrThrow(id);
    return this.toCampaignView(doc);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const doc = await this.findDocOrThrow(id);

    if (!EDITABLE_STATUSES.has(doc.status)) {
      throw new CampaignStatusError(
        id,
        doc.status,
        `${CampaignStatus.DRAFT} or ${CampaignStatus.REJECTED}`,
      );
    }

    Object.assign(doc, dto);
    await doc.save();
    return this.toCampaignView(doc);
  }

  async remove(id: string) {
    const doc = await this.findDocOrThrow(id);

    if (doc.status !== CampaignStatus.DRAFT) {
      throw new CampaignStatusError(id, doc.status, CampaignStatus.DRAFT);
    }

    await doc.deleteOne();
  }

  // ─── State transitions ─────────────────────────────────────────────

  async submitForApproval(id: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.PENDING_APPROVAL);

    doc.status = CampaignStatus.PENDING_APPROVAL;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async approve(id: string, approvedBy: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.APPROVED);

    doc.status = CampaignStatus.APPROVED;
    doc.approvedBy = approvedBy;
    doc.approvedAt = new Date();
    await doc.save();
    return this.toCampaignView(doc);
  }

  async reject(id: string, rejectedBy: string, reason: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.REJECTED);

    doc.status = CampaignStatus.REJECTED;
    doc.rejectedBy = rejectedBy;
    doc.rejectedAt = new Date();
    doc.rejectionReason = reason;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async schedule(id: string, schedule: CampaignSchedule) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.SCHEDULED);

    doc.status = CampaignStatus.SCHEDULED;
    doc.schedule = schedule;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async start(id: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.RUNNING);

    doc.status = CampaignStatus.RUNNING;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async pause(id: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.PAUSED);

    doc.status = CampaignStatus.PAUSED;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async resume(id: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.RUNNING);

    doc.status = CampaignStatus.RUNNING;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async complete(id: string) {
    const doc = await this.findDocOrThrow(id);
    this.assertTransition(id, doc.status, CampaignStatus.COMPLETED);

    doc.status = CampaignStatus.COMPLETED;
    await doc.save();
    return this.toCampaignView(doc);
  }

  async cancel(id: string) {
    const doc = await this.findDocOrThrow(id);

    if (TERMINAL_STATUSES.has(doc.status)) {
      throw new CampaignStatusError(
        id,
        doc.status,
        'any non-terminal status',
      );
    }

    // For non-terminal statuses, verify CANCELLED is a valid target
    this.assertTransition(id, doc.status, CampaignStatus.CANCELLED);

    doc.status = CampaignStatus.CANCELLED;
    await doc.save();
    return this.toCampaignView(doc);
  }

  // ─── Analytics ──────────────────────────────────────────────────────

  async updateAnalytics(id: string, analytics: Partial<CampaignAnalytics>) {
    const incFields: Record<string, number> = {};
    for (const [key, value] of Object.entries(analytics)) {
      if (typeof value === 'number') {
        incFields[`analytics.${key}`] = value;
      }
    }

    const doc = await this.campaignModel
      .findByIdAndUpdate(id, { $inc: incFields }, { new: true })
      .exec();

    if (!doc) {
      throw new CampaignNotFoundError(id);
    }

    return this.toCampaignView(doc);
  }

  async getAnalytics(id: string) {
    const doc = await this.findDocOrThrow(id);
    return doc.analytics;
  }

  // ─── Query helpers ──────────────────────────────────────────────────

  async findByStatus(organizationId: string, status: CampaignStatus) {
    const docs = await this.campaignModel
      .find({ organizationId, status })
      .exec();
    return docs.map((d) => this.toCampaignView(d));
  }

  async findByTag(organizationId: string, tag: string) {
    const docs = await this.campaignModel
      .find({ organizationId, tags: tag })
      .exec();
    return docs.map((d) => this.toCampaignView(d));
  }
}
