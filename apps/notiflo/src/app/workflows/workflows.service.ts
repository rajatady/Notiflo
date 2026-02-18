import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workflow, WorkflowDocument } from './schemas/workflow.schema';
import {
  WorkflowExecution as WorkflowExecutionDoc,
  WorkflowExecutionDocument,
} from './schemas/workflow-execution.schema';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/create-workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectModel('Workflow')
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel('WorkflowExecution')
    private readonly executionModel: Model<WorkflowExecutionDocument>,
  ) {}

  // ===========================================================================
  // Workflow CRUD
  // ===========================================================================

  async create(dto: CreateWorkflowDto): Promise<WorkflowDocument> {
    return this.workflowModel.create(dto);
  }

  async findAll(organizationId: string): Promise<WorkflowDocument[]> {
    return this.workflowModel.find({ organizationId }).exec();
  }

  async findOne(id: string): Promise<WorkflowDocument | null> {
    return this.workflowModel.findById(id).exec();
  }

  async update(
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowDocument | null> {
    return this.workflowModel
      .findByIdAndUpdate(
        id,
        {
          ...dto,
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
  }

  async remove(id: string): Promise<void> {
    await this.workflowModel.findByIdAndDelete(id).exec();
  }

  // ===========================================================================
  // Activate / Deactivate
  // ===========================================================================

  async activate(id: string): Promise<WorkflowDocument | null> {
    return this.workflowModel
      .findByIdAndUpdate(id, { active: true }, { new: true })
      .exec();
  }

  async deactivate(id: string): Promise<WorkflowDocument | null> {
    return this.workflowModel
      .findByIdAndUpdate(id, { active: false }, { new: true })
      .exec();
  }

  // ===========================================================================
  // Query helpers
  // ===========================================================================

  /**
   * Finds active workflows for an organization whose entry step
   * has a trigger config with the given eventName.
   */
  async findByTriggerEvent(
    organizationId: string,
    eventName: string,
  ): Promise<WorkflowDocument[]> {
    // We look for workflows that are active, in the given org,
    // and have an entry step whose config.eventName matches.
    const workflows = await this.workflowModel
      .find({
        organizationId,
        active: true,
      })
      .exec();

    // Filter in application layer to match entryStep config eventName
    return workflows.filter((wf) => {
      const entryStep = wf.steps.find((s) => s.id === wf.entryStepId);
      if (!entryStep || !entryStep.config) return false;
      return (entryStep.config as Record<string, unknown>)['eventName'] === eventName;
    });
  }

  /**
   * Finds workflows for an organization that contain the given tag.
   */
  async findByTag(
    organizationId: string,
    tag: string,
  ): Promise<WorkflowDocument[]> {
    return this.workflowModel
      .find({
        organizationId,
        tags: tag,
      })
      .exec();
  }

  // ===========================================================================
  // Execution CRUD
  // ===========================================================================

  async createExecution(
    data: Partial<WorkflowExecutionDoc>,
  ): Promise<WorkflowExecutionDocument> {
    return this.executionModel.create(data);
  }

  async updateExecution(
    id: string,
    data: Partial<WorkflowExecutionDoc>,
  ): Promise<WorkflowExecutionDocument | null> {
    return this.executionModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
  }

  async findExecutions(
    workflowId: string,
  ): Promise<WorkflowExecutionDocument[]> {
    return this.executionModel.find({ workflowId }).exec();
  }
}
