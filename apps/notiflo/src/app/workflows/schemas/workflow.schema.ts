import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type WorkflowDocument = HydratedDocument<Workflow>;

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  description?: string;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        type: { type: String, required: true },
        name: { type: String },
        config: { type: MongooseSchema.Types.Mixed },
        nextSteps: { type: [String] },
      },
    ],
    default: [],
  })
  steps: {
    id: string;
    type: string;
    name?: string;
    config: Record<string, unknown>;
    nextSteps?: string[];
  }[];

  @Prop({ type: String, required: true })
  entryStepId: string;

  @Prop({ type: Boolean, default: false })
  active: boolean;

  @Prop({ type: Number, default: 1 })
  version: number;

  @Prop({ type: [String] })
  tags?: string[];

  // Populated by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);

// Compound index for looking up active workflows by org
WorkflowSchema.index({ organizationId: 1, active: 1 });
