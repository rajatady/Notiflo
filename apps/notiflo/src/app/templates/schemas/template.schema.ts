import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type NotifloTemplateDocument = HydratedDocument<NotifloTemplate>;

@Schema()
export class TemplateVariableSchema {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    enum: ['string', 'number', 'boolean', 'date', 'object', 'array'],
  })
  type: string;

  @Prop({ type: Boolean, required: true })
  required: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  defaultValue?: unknown;

  @Prop({ type: String })
  description?: string;
}

export const TemplateVariableSchemaDefinition =
  SchemaFactory.createForClass(TemplateVariableSchema);

@Schema({ timestamps: true })
export class NotifloTemplate {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  description?: string;

  @Prop({
    type: Map,
    of: {
      subject: { type: String },
      body: { type: String, required: true },
      metadata: { type: MongooseSchema.Types.Mixed },
    },
  })
  channels: Map<
    string,
    { subject?: string; body: string; metadata?: Record<string, unknown> }
  >;

  @Prop({ type: [TemplateVariableSchemaDefinition], default: [] })
  variables: TemplateVariableSchema[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Number, default: 1 })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export const NotifloTemplateSchema =
  SchemaFactory.createForClass(NotifloTemplate);
