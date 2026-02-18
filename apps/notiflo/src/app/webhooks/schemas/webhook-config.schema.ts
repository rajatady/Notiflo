import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class WebhookConfigDocument extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  secret?: string;

  @Prop({ type: [String], default: [] })
  events: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  headers: Record<string, string>;

  @Prop({ default: true })
  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const WebhookConfigSchema =
  SchemaFactory.createForClass(WebhookConfigDocument);
