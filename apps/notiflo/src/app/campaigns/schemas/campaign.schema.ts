import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { CampaignStatus } from '../../core/types/campaign.types';
import { Channel } from '../../core/types/channel.types';

export type CampaignDocument = HydratedDocument<Campaign>;

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: [String], enum: Object.values(Channel) })
  channels: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  templateIds: Record<string, string>;

  @Prop({
    type: raw({
      filters: [
        {
          field: { type: String },
          operator: { type: String },
          value: { type: MongooseSchema.Types.Mixed },
        },
      ],
      logic: { type: String },
    }),
  })
  targetSegment?: {
    filters: { field: string; operator: string; value: unknown }[];
    logic: string;
  };

  @Prop({
    type: raw({
      type: { type: String },
      scheduledAt: { type: Date },
      cron: { type: String },
      timezone: { type: String },
      endAt: { type: Date },
    }),
  })
  schedule?: {
    type: string;
    scheduledAt?: Date;
    cron?: string;
    timezone?: string;
    endAt?: Date;
  };

  @Prop({
    type: String,
    enum: Object.values(CampaignStatus),
    default: CampaignStatus.DRAFT,
    index: true,
  })
  status: string;

  @Prop({ type: String })
  approvedBy?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: String })
  rejectedBy?: string;

  @Prop({ type: Date })
  rejectedAt?: Date;

  @Prop({ type: String })
  rejectionReason?: string;

  @Prop({
    type: raw({
      totalRecipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
    }),
    default: {
      totalRecipients: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
    },
  })
  analytics: {
    totalRecipients: number;
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };

  @Prop({ type: [String] })
  tags?: string[];

  @Prop({ type: String, required: true })
  createdBy: string;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
