import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationDocument } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  NotificationStatus,
  NotificationQuery,
  NotificationStats,
  Channel,
} from '../core';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    return this.notificationModel.create({
      organizationId: dto.organizationId,
      subscriberId: dto.subscriberId,
      channel: dto.channel,
      templateId: dto.templateId,
      campaignId: dto.campaignId,
      workflowId: dto.workflowId,
      workflowExecutionId: dto.workflowExecutionId,
      provider: dto.provider,
      content: dto.content || {},
      metadata: dto.metadata,
      status: NotificationStatus.PENDING,
    });
  }

  async findAll(query: NotificationQuery): Promise<NotificationDocument[]> {
    const filter: Record<string, unknown> = {
      organizationId: query.organizationId,
    };

    if (query.subscriberId) {
      filter.subscriberId = query.subscriberId;
    }

    if (query.channel) {
      filter.channel = query.channel;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.campaignId) {
      filter.campaignId = query.campaignId;
    }

    if (query.workflowId) {
      filter.workflowId = query.workflowId;
    }

    if (query.from || query.to) {
      const dateFilter: Record<string, Date> = {};
      if (query.from) {
        dateFilter['$gte'] = query.from;
      }
      if (query.to) {
        dateFilter['$lte'] = query.to;
      }
      filter.createdAt = dateFilter;
    }

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async findOne(id: string): Promise<NotificationDocument | null> {
    return this.notificationModel.findById(id).exec();
  }

  async updateStatus(
    id: string,
    status: NotificationStatus,
  ): Promise<NotificationDocument | null> {
    const update: Record<string, unknown> = { status };

    if (status === NotificationStatus.SENT) {
      // Only set sentAt if not already set
      const existing = await this.notificationModel.findById(id).exec();
      if (existing && !existing.sentAt) {
        update.sentAt = new Date();
      }
    }

    if (status === NotificationStatus.DELIVERED) {
      update.deliveredAt = new Date();
    }

    return this.notificationModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  async getStats(organizationId: string): Promise<NotificationStats> {
    const pipeline = [
      { $match: { organizationId } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          byChannel: [
            { $group: { _id: '$channel', count: { $sum: 1 } } },
          ],
        },
      },
    ];

    const [result] = await this.notificationModel.aggregate(pipeline).exec();

    const total = result.total.length > 0 ? result.total[0].count : 0;

    // Build byStatus map with all statuses initialized to 0
    const byStatus = {} as Record<NotificationStatus, number>;
    for (const status of Object.values(NotificationStatus)) {
      byStatus[status] = 0;
    }
    for (const entry of result.byStatus) {
      byStatus[entry._id as NotificationStatus] = entry.count;
    }

    // Build byChannel map with all channels initialized to 0
    const byChannel = {} as Record<Channel, number>;
    for (const channel of Object.values(Channel)) {
      byChannel[channel] = 0;
    }
    for (const entry of result.byChannel) {
      byChannel[entry._id as Channel] = entry.count;
    }

    return { total, byStatus, byChannel };
  }
}
