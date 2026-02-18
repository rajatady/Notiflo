import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { NotificationStatus, Channel } from '../../core';

@Schema({ timestamps: true })
export class NotificationDocument extends Document {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  subscriberId: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(Channel),
    index: true,
  })
  channel: string;

  @Prop()
  templateId?: string;

  @Prop({ index: true })
  campaignId?: string;

  @Prop()
  workflowId?: string;

  @Prop()
  workflowExecutionId?: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.PENDING,
    index: true,
  })
  status: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  content: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  result?: {
    success: boolean;
    messageId?: string;
    error?: string;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema =
  SchemaFactory.createForClass(NotificationDocument);
