import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import {
  WorkflowStepType,
  TriggerType,
  WorkflowExecutionStatus,
  Channel,
} from '../core';

describe('WorkflowsController', () => {
  let controller: WorkflowsController;
  let workflowsService: jest.Mocked<Partial<WorkflowsService>>;
  let engineService: jest.Mocked<Partial<WorkflowEngineService>>;

  const mockWorkflow = {
    _id: 'wf-123',
    organizationId: 'org-1',
    name: 'Test Workflow',
    description: 'A test workflow',
    steps: [
      {
        id: 'trigger-1',
        type: WorkflowStepType.TRIGGER,
        config: {
          triggerType: TriggerType.EVENT,
          eventName: 'user.signup',
        },
        nextSteps: ['send-1'],
      },
      {
        id: 'send-1',
        type: WorkflowStepType.SEND,
        config: {
          channel: Channel.EMAIL,
          templateId: 'tmpl-1',
        },
      },
    ],
    entryStepId: 'trigger-1',
    active: false,
    version: 1,
    tags: ['test'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    toObject: function () { return { ...this }; },
  };

  const mockExecution = {
    _id: 'exec-1',
    id: 'exec-1',
    workflowId: 'wf-123',
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    status: WorkflowExecutionStatus.COMPLETED,
    currentStepId: 'send-1',
    context: {},
    stepResults: [
      {
        stepId: 'trigger-1',
        status: 'completed',
        executedAt: new Date(),
      },
      {
        stepId: 'send-1',
        status: 'completed',
        executedAt: new Date(),
      },
    ],
    startedAt: new Date(),
    completedAt: new Date(),
  };

  beforeEach(async () => {
    workflowsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findExecutions: jest.fn(),
    };

    engineService = {
      executeWorkflow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        { provide: WorkflowsService, useValue: workflowsService },
        { provide: WorkflowEngineService, useValue: engineService },
      ],
    }).compile();

    controller = module.get<WorkflowsController>(WorkflowsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===========================================================================
  // POST / - create workflow
  // ===========================================================================
  describe('POST / (create)', () => {
    it('should create a workflow', async () => {
      const dto = {
        organizationId: 'org-1',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: mockWorkflow.steps,
        entryStepId: 'trigger-1',
        tags: ['test'],
      };

      workflowsService.create!.mockResolvedValue(mockWorkflow as any);

      const result = await controller.create(dto as any);

      expect(workflowsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockWorkflow);
    });
  });

  // ===========================================================================
  // GET / - list workflows
  // ===========================================================================
  describe('GET / (findAll)', () => {
    it('should list workflows for an organization', async () => {
      workflowsService.findAll!.mockResolvedValue([mockWorkflow] as any);

      const result = await controller.findAll('org-1');

      expect(workflowsService.findAll).toHaveBeenCalledWith('org-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Workflow');
    });
  });

  // ===========================================================================
  // GET /:id - get workflow
  // ===========================================================================
  describe('GET /:id (findOne)', () => {
    it('should get a workflow by id', async () => {
      workflowsService.findOne!.mockResolvedValue(mockWorkflow as any);

      const result = await controller.findOne('wf-123');

      expect(workflowsService.findOne).toHaveBeenCalledWith('wf-123');
      expect(result).toEqual(mockWorkflow);
    });
  });

  // ===========================================================================
  // PATCH /:id - update workflow
  // ===========================================================================
  describe('PATCH /:id (update)', () => {
    it('should update a workflow', async () => {
      const updatedWorkflow = {
        ...mockWorkflow,
        name: 'Updated Workflow',
        version: 2,
      };
      workflowsService.update!.mockResolvedValue(updatedWorkflow as any);

      const result = await controller.update('wf-123', {
        name: 'Updated Workflow',
      } as any);

      expect(workflowsService.update).toHaveBeenCalledWith('wf-123', {
        name: 'Updated Workflow',
      });
      expect(result.name).toBe('Updated Workflow');
      expect(result.version).toBe(2);
    });
  });

  // ===========================================================================
  // DELETE /:id - delete workflow
  // ===========================================================================
  describe('DELETE /:id (remove)', () => {
    it('should delete a workflow', async () => {
      workflowsService.remove!.mockResolvedValue(undefined as any);

      await controller.remove('wf-123');

      expect(workflowsService.remove).toHaveBeenCalledWith('wf-123');
    });
  });

  // ===========================================================================
  // POST /:id/execute - trigger execution
  // ===========================================================================
  describe('POST /:id/execute (execute)', () => {
    it('should trigger workflow execution', async () => {
      workflowsService.findOne!.mockResolvedValue(mockWorkflow as any);
      engineService.executeWorkflow!.mockResolvedValue(mockExecution as any);

      const body = { subscriberId: 'sub-1', context: { key: 'value' } };
      const result = await controller.execute('wf-123', body);

      expect(workflowsService.findOne).toHaveBeenCalledWith('wf-123');
      expect(engineService.executeWorkflow).toHaveBeenCalled();
      expect(result).toEqual(mockExecution);
    });
  });

  // ===========================================================================
  // GET /:id/executions - list executions
  // ===========================================================================
  describe('GET /:id/executions (findExecutions)', () => {
    it('should list executions for a workflow', async () => {
      workflowsService.findExecutions!.mockResolvedValue([
        mockExecution,
      ] as any);

      const result = await controller.findExecutions('wf-123');

      expect(workflowsService.findExecutions).toHaveBeenCalledWith('wf-123');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(WorkflowExecutionStatus.COMPLETED);
    });
  });
});
