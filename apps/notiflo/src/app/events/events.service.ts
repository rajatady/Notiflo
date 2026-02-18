import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotifloEventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import {
  EVENT_BUS,
  IEventBus,
  EventFilter,
  EventSource,
  NotifloEvent,
} from '../core';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel('NotifloEvent')
    private readonly eventModel: Model<NotifloEventDocument>,
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus,
  ) {}

  async ingest(dto: CreateEventDto): Promise<NotifloEventDocument> {
    const eventDoc = await this.eventModel.create({
      organizationId: dto.organizationId,
      name: dto.name,
      subscriberId: dto.subscriberId,
      payload: dto.payload || {},
      source: dto.source || EventSource.API,
      processed: false,
    });

    // Publish to the event bus
    const event: NotifloEvent = {
      id: eventDoc._id.toString(),
      organizationId: eventDoc.organizationId,
      name: eventDoc.name,
      subscriberId: eventDoc.subscriberId,
      payload: eventDoc.payload,
      timestamp: eventDoc.createdAt,
      source: eventDoc.source as EventSource,
      processed: eventDoc.processed,
    };

    await this.eventBus.publish(event);

    return eventDoc;
  }

  async findAll(filter: EventFilter): Promise<NotifloEventDocument[]> {
    const query: Record<string, unknown> = {
      organizationId: filter.organizationId,
    };

    if (filter.name) {
      query.name = filter.name;
    }

    if (filter.subscriberId) {
      query.subscriberId = filter.subscriberId;
    }

    if (filter.source) {
      query.source = filter.source;
    }

    if (filter.processed !== undefined) {
      query.processed = filter.processed;
    }

    if (filter.from || filter.to) {
      const dateFilter: Record<string, Date> = {};
      if (filter.from) {
        dateFilter['$gte'] = filter.from;
      }
      if (filter.to) {
        dateFilter['$lte'] = filter.to;
      }
      query.createdAt = dateFilter;
    }

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    return this.eventModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async findOne(id: string): Promise<NotifloEventDocument | null> {
    return this.eventModel.findById(id).exec();
  }

  async markProcessed(id: string): Promise<NotifloEventDocument> {
    return this.eventModel
      .findByIdAndUpdate(id, { processed: true }, { new: true })
      .exec();
  }
}
