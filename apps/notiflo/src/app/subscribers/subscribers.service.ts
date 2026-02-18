import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Subscriber,
  SubscriberDocument,
  ChannelPreference,
} from './schemas/subscriber.schema';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';

export interface SegmentFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}

@Injectable()
export class SubscribersService {
  constructor(
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: Model<SubscriberDocument>,
  ) {}

  async create(
    createSubscriberDto: CreateSubscriberDto,
  ): Promise<SubscriberDocument> {
    return this.subscriberModel.create(createSubscriberDto);
  }

  async findAll(
    organizationId: string,
    limit?: number,
    offset?: number,
  ): Promise<SubscriberDocument[]> {
    const query = this.subscriberModel.find({ organizationId });

    if (offset !== undefined) {
      query.skip(offset);
    }

    if (limit !== undefined) {
      query.limit(limit);
    }

    return query.exec();
  }

  async findOne(id: string): Promise<SubscriberDocument | null> {
    return this.subscriberModel.findById(id).exec();
  }

  async findByExternalId(
    organizationId: string,
    externalId: string,
  ): Promise<SubscriberDocument | null> {
    return this.subscriberModel
      .findOne({ organizationId, externalId })
      .exec();
  }

  async update(
    id: string,
    updateSubscriberDto: UpdateSubscriberDto,
  ): Promise<SubscriberDocument | null> {
    return this.subscriberModel
      .findByIdAndUpdate(id, { $set: updateSubscriberDto }, { new: true })
      .exec();
  }

  async updatePreferences(
    id: string,
    preferences: Record<string, ChannelPreference>,
  ): Promise<SubscriberDocument | null> {
    const updateOps: Record<string, ChannelPreference> = {};
    for (const [channel, pref] of Object.entries(preferences)) {
      updateOps[`channelPreferences.${channel}`] = pref;
    }

    return this.subscriberModel
      .findByIdAndUpdate(id, { $set: updateOps }, { new: true })
      .exec();
  }

  async remove(id: string): Promise<SubscriberDocument | null> {
    return this.subscriberModel.findByIdAndDelete(id).exec();
  }

  async findBySegment(
    organizationId: string,
    filters: SegmentFilter[],
  ): Promise<SubscriberDocument[]> {
    const query: Record<string, unknown> = { organizationId };

    for (const filter of filters) {
      switch (filter.operator) {
        case 'eq':
          query[filter.field] = filter.value;
          break;
        case 'ne':
          query[filter.field] = { $ne: filter.value };
          break;
        case 'gt':
          query[filter.field] = { $gt: filter.value };
          break;
        case 'lt':
          query[filter.field] = { $lt: filter.value };
          break;
        case 'gte':
          query[filter.field] = { $gte: filter.value };
          break;
        case 'lte':
          query[filter.field] = { $lte: filter.value };
          break;
        case 'contains':
          query[filter.field] = filter.value;
          break;
        case 'in':
          query[filter.field] = { $in: filter.value };
          break;
      }
    }

    return this.subscriberModel.find(query).exec();
  }
}
