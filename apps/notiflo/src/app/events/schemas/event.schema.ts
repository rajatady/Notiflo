import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { EventSource } from '../../core';

@Schema({ timestamps: true })
export class NotifloEventDocument extends Document {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ index: true })
  subscriberId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  payload: Record<string, unknown>;

  @Prop({
    type: String,
    enum: Object.values(EventSource),
    default: EventSource.API,
  })
  source: string;

  @Prop({ default: false })
  processed: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const NotifloEventSchema = SchemaFactory.createForClass(NotifloEventDocument);
