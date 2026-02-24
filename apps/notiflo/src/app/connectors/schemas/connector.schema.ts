import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ConnectorDocument = HydratedDocument<Connector>;

export const CONNECTOR_TYPES = [
  'redis_stream',
  'redis_queue',
  'websocket',
  'kafka',
] as const;

export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_STATUSES = [
  'connected',
  'disconnected',
  'error',
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

@Schema({ timestamps: true })
export class Connector {
  @Prop({ type: String, required: true })
  organizationId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true, enum: CONNECTOR_TYPES })
  type: ConnectorType;

  /** Type-specific configuration stored as a flexible object */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  config: Record<string, unknown>;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: String, enum: CONNECTOR_STATUSES, default: 'disconnected' })
  status: ConnectorStatus;

  @Prop({ type: String })
  statusMessage?: string;

  @Prop({ type: Number, default: 0 })
  ticksIngested: number;

  @Prop({ type: Date })
  lastTickAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConnectorSchema = SchemaFactory.createForClass(Connector);

ConnectorSchema.index({ organizationId: 1 });
ConnectorSchema.index({ active: 1 });
