import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  ExecuteWorkflowDto,
} from './dto/create-workflow.dto';
import { WorkflowNotFoundError } from '../core/errors/notiflo.errors';
import type { WorkflowDefinition, WorkflowStep } from '../core';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly engineService: WorkflowEngineService,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(dto);
  }

  @Get()
  async findAll(@Query('organizationId') organizationId: string) {
    return this.workflowsService.findAll(organizationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }

  @Post(':id/execute')
  @UsePipes(new ValidationPipe({ transform: true }))
  async execute(
    @Param('id') id: string,
    @Body() body: ExecuteWorkflowDto,
  ) {
    const workflow = await this.workflowsService.findOne(id);
    if (!workflow) {
      throw new NotFoundException(`Workflow not found: ${id}`);
    }

    // Convert the Mongoose document to a WorkflowDefinition shape
    const doc = workflow.toObject();
    const definition: WorkflowDefinition = {
      id: doc._id.toString(),
      organizationId: doc.organizationId,
      name: doc.name,
      description: doc.description,
      steps: doc.steps as unknown as WorkflowStep[],
      entryStepId: doc.entryStepId,
      active: doc.active,
      version: doc.version,
      tags: doc.tags,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    return this.engineService.executeWorkflow(
      definition,
      body.subscriberId,
      body.context || {},
    );
  }

  @Get(':id/executions')
  async findExecutions(@Param('id') id: string) {
    return this.workflowsService.findExecutions(id);
  }
}
