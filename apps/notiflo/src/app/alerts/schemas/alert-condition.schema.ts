import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AlertConditionDocument = HydratedDocument<AlertCondition>;

@Schema({ timestamps: true })
export class AlertCondition {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true, index: true })
  subscriberId: string;

  @Prop({ type: String, required: true, index: true })
  symbol: string;

  /** 'threshold_crossing' | 'expression' | 'script' */
  @Prop({ type: String, required: true })
  strategyType: string;

  /** Strategy-specific parameters stored as a flexible object */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  strategyParams: Record<string, unknown>;

  @Prop({ type: [String], required: true })
  channels: string[];

  @Prop({ type: String })
  templateId?: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  /** Cooldown between repeated triggers in ms */
  @Prop({ type: Number })
  cooldownMs?: number;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Date })
  lastTriggeredAt?: Date;

  @Prop({ type: Number, default: 0 })
  triggerCount: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AlertConditionSchema =
  SchemaFactory.createForClass(AlertCondition);

AlertConditionSchema.index({ organizationId: 1, subscriberId: 1 });
AlertConditionSchema.index({ organizationId: 1, symbol: 1 });
AlertConditionSchema.index({ active: 1 });
