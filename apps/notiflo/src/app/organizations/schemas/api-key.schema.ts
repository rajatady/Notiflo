import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  key: string;

  @Prop({ type: String, required: true })
  prefix: string;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
