import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import { Workflow, WorkflowSchema } from './schemas/workflow.schema';
import {
  WorkflowExecution,
  WorkflowExecutionSchema,
} from './schemas/workflow-execution.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Workflow', schema: WorkflowSchema },
      { name: 'WorkflowExecution', schema: WorkflowExecutionSchema },
    ]),
  ],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    { provide: 'WorkflowsService', useExisting: WorkflowsService },
    WorkflowEngineService,
    { provide: 'WorkflowEngine', useExisting: WorkflowEngineService },
  ],
  exports: [WorkflowsService, 'WorkflowsService', WorkflowEngineService, 'WorkflowEngine'],
})
export class WorkflowsModule {}
