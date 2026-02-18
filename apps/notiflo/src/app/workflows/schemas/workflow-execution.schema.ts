import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { WorkflowExecutionStatus } from '../../core';

export type WorkflowExecutionDocument = HydratedDocument<WorkflowExecution>;

@Schema({ timestamps: true })
export class WorkflowExecution {
  @Prop({ type: String, required: true, index: true })
  workflowId: string;

  @Prop({ type: String, required: true, index: true })
  organizationId: string;

  @Prop({ type: String, required: true, index: true })
  subscriberId: string;

  @Prop({
    type: String,
    enum: Object.values(WorkflowExecutionStatus),
    default: WorkflowExecutionStatus.RUNNING,
  })
  status: string;

  @Prop({ type: String })
  currentStepId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  context: Record<string, unknown>;

  @Prop({
    type: [
      {
        stepId: { type: String, required: true },
        status: { type: String, required: true },
        output: { type: MongooseSchema.Types.Mixed },
        error: { type: String },
        executedAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  stepResults: {
    stepId: string;
    status: string;
    output?: Record<string, unknown>;
    error?: string;
    executedAt: Date;
  }[];

  @Prop({ type: Date, default: Date.now })
  startedAt: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: String })
  error?: string;

  // Populated by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowExecutionSchema =
  SchemaFactory.createForClass(WorkflowExecution);
