import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Channel } from '../../core';

export interface ChannelPreference {
  enabled: boolean;
  providerId?: string;
}

export type SubscriberDocument = HydratedDocument<Subscriber>;

@Schema({ timestamps: true })
export class Subscriber {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true, index: true })
  externalId: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String })
  phone?: string;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: String })
  avatar?: string;

  @Prop({ type: String, default: 'en' })
  locale: string;

  @Prop({ type: String })
  timezone?: string;

  @Prop({ type: [String], default: [] })
  pushTokens: string[];

  @Prop({
    type: Map,
    of: {
      enabled: { type: Boolean, required: true },
      providerId: { type: String },
    },
    default: new Map(),
  })
  channelPreferences: Map<string, ChannelPreference>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  customAttributes?: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date })
  lastSeenAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);

// Compound unique index on organizationId + externalId
SubscriberSchema.index({ organizationId: 1, externalId: 1 }, { unique: true });
