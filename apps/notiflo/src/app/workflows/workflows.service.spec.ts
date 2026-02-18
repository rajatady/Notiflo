import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WorkflowsService } from './workflows.service';
import {
  WorkflowStepType,
  TriggerType,
  WorkflowExecutionStatus,
  Channel,
} from '../core';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let workflowModel: any;
  let executionModel: any;

  const sampleWorkflowDto = {
    organizationId: 'org-1',
    name: 'Welcome Workflow',
    description: 'Sends welcome email on signup',
    steps: [
      {
        id: 'trigger-1',
        type: WorkflowStepType.TRIGGER,
        name: 'Signup Trigger',
        config: {
          triggerType: TriggerType.EVENT,
          eventName: 'user.signup',
        },
        nextSteps: ['send-1'],
      },
      {
        id: 'send-1',
        type: WorkflowStepType.SEND,
        name: 'Send Welcome Email',
        config: {
          channel: Channel.EMAIL,
          templateId: 'tmpl-welcome',
        },
      },
    ],
    entryStepId: 'trigger-1',
    tags: ['onboarding', 'email'],
  };

  beforeEach(async () => {
    workflowModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    executionModel = {
      create: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        {
          provide: getModelToken('Workflow'),
          useValue: workflowModel,
        },
        {
          provide: getModelToken('WorkflowExecution'),
          useValue: executionModel,
        },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
  });

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================
  describe('CRUD operations', () => {
    it('should create a workflow', async () => {
      const mockCreated = {
        _id: 'wf-id-1',
        ...sampleWorkflowDto,
        active: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      workflowModel.create.mockResolvedValueOnce(mockCreated);

      const created = await service.create(sampleWorkflowDto);

      expect(workflowModel.create).toHaveBeenCalledWith(sampleWorkflowDto);
      expect(created).toBeDefined();
      expect(created._id).toBeDefined();
      expect(created.name).toBe('Welcome Workflow');
      expect(created.organizationId).toBe('org-1');
      expect(created.steps).toHaveLength(2);
      expect(created.entryStepId).toBe('trigger-1');
      expect(created.active).toBe(false);
      expect(created.version).toBe(1);
      expect(created.tags).toEqual(['onboarding', 'email']);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('should find a workflow by id', async () => {
      const mockFound = {
        _id: 'wf-id-1',
        name: 'Find By Id Workflow',
      };
      workflowModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockFound),
      });

      const found = await service.findOne('wf-id-1');

      expect(found).toBeDefined();
      expect(found.name).toBe('Find By Id Workflow');
    });

    it('should find all workflows for an organization', async () => {
      const mockResults = [
        { _id: 'wf1', name: 'Workflow A', organizationId: 'org-findall' },
        { _id: 'wf2', name: 'Workflow B', organizationId: 'org-findall' },
      ];
      workflowModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const results = await service.findAll('org-findall');

      expect(workflowModel.find).toHaveBeenCalledWith({ organizationId: 'org-findall' });
      expect(results).toHaveLength(2);
      const names = results.map((w) => w.name);
      expect(names).toContain('Workflow A');
      expect(names).toContain('Workflow B');
    });

    it('should update a workflow (increments version)', async () => {
      const mockUpdated = {
        _id: 'wf-id-1',
        name: 'Updated Name',
        description: 'Updated description',
        version: 2,
      };
      workflowModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.update('wf-id-1', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(workflowModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'wf-id-1',
        {
          name: 'Updated Name',
          description: 'Updated description',
          $inc: { version: 1 },
        },
        { new: true },
      );
      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
      expect(updated.version).toBe(2);
    });

    it('should delete a workflow', async () => {
      workflowModel.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce({ _id: 'wf-id-1' }),
      });

      await service.remove('wf-id-1');

      expect(workflowModel.findByIdAndDelete).toHaveBeenCalledWith('wf-id-1');
    });

    it('should return null for non-existent workflow', async () => {
      workflowModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findOne('non-existent-id');
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // Activate / Deactivate
  // ===========================================================================
  describe('activate / deactivate', () => {
    it('should activate a workflow', async () => {
      const mockActivated = {
        _id: 'wf-id-1',
        active: true,
      };
      workflowModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockActivated),
      });

      const activated = await service.activate('wf-id-1');

      expect(workflowModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'wf-id-1',
        { active: true },
        { new: true },
      );
      expect(activated.active).toBe(true);
    });

    it('should deactivate a workflow', async () => {
      const mockDeactivated = {
        _id: 'wf-id-1',
        active: false,
      };
      workflowModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDeactivated),
      });

      const deactivated = await service.deactivate('wf-id-1');

      expect(workflowModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'wf-id-1',
        { active: false },
        { new: true },
      );
      expect(deactivated.active).toBe(false);
    });
  });

  // ===========================================================================
  // Query by trigger event name
  // ===========================================================================
  describe('findByTriggerEvent', () => {
    it('should find active workflows by trigger event name', async () => {
      const mockWorkflows = [
        {
          _id: 'wf-id-1',
          name: 'Event Trigger Workflow',
          organizationId: 'org-trigger',
          active: true,
          entryStepId: 'trigger-1',
          steps: [
            {
              id: 'trigger-1',
              type: WorkflowStepType.TRIGGER,
              config: {
                triggerType: TriggerType.EVENT,
                eventName: 'order.completed',
              },
              nextSteps: ['send-1'],
            },
            {
              id: 'send-1',
              type: WorkflowStepType.SEND,
              config: { channel: Channel.EMAIL, templateId: 'tmpl-1' },
            },
          ],
        },
      ];
      workflowModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockWorkflows),
      });

      const found = await service.findByTriggerEvent('org-trigger', 'order.completed');

      expect(workflowModel.find).toHaveBeenCalledWith({
        organizationId: 'org-trigger',
        active: true,
      });
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found[0].name).toBe('Event Trigger Workflow');
    });

    it('should not find inactive workflows by trigger event name', async () => {
      workflowModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce([]),
      });

      const found = await service.findByTriggerEvent('org-trigger-inactive', 'user.deleted');
      expect(found).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Query by tag
  // ===========================================================================
  describe('findByTag', () => {
    it('should find workflows by tag', async () => {
      const mockResults = [
        { _id: 'wf1', name: 'Tagged Workflow', organizationId: 'org-tag', tags: ['marketing', 'promo'] },
      ];
      workflowModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const found = await service.findByTag('org-tag', 'marketing');

      expect(workflowModel.find).toHaveBeenCalledWith({
        organizationId: 'org-tag',
        tags: 'marketing',
      });
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found[0].name).toBe('Tagged Workflow');
    });

    it('should not find workflows with different tags', async () => {
      workflowModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce([]),
      });

      const found = await service.findByTag('org-tag-miss', 'marketing');
      expect(found).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Execution CRUD
  // ===========================================================================
  describe('execution management', () => {
    it('should create an execution record', async () => {
      const mockExecution = {
        _id: 'exec-id-1',
        workflowId: 'wf-exec-1',
        organizationId: 'org-exec',
        subscriberId: 'sub-1',
        status: WorkflowExecutionStatus.RUNNING,
        currentStepId: 'trigger-1',
        context: { key: 'value' },
        stepResults: [],
        startedAt: new Date(),
      };
      executionModel.create.mockResolvedValueOnce(mockExecution);

      const execution = await service.createExecution({
        workflowId: 'wf-exec-1',
        organizationId: 'org-exec',
        subscriberId: 'sub-1',
        status: WorkflowExecutionStatus.RUNNING,
        currentStepId: 'trigger-1',
        context: { key: 'value' },
        stepResults: [],
        startedAt: new Date(),
      });

      expect(execution).toBeDefined();
      expect(execution._id).toBeDefined();
      expect(execution.workflowId).toBe('wf-exec-1');
      expect(execution.status).toBe(WorkflowExecutionStatus.RUNNING);
    });

    it('should update an execution record', async () => {
      const mockUpdated = {
        _id: 'exec-id-1',
        status: WorkflowExecutionStatus.COMPLETED,
        completedAt: new Date(),
      };
      executionModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.updateExecution('exec-id-1', {
        status: WorkflowExecutionStatus.COMPLETED,
        completedAt: new Date(),
      });

      expect(executionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'exec-id-1',
        expect.objectContaining({
          status: WorkflowExecutionStatus.COMPLETED,
        }),
        { new: true },
      );
      expect(updated.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(updated.completedAt).toBeDefined();
    });

    it('should find executions for a workflow', async () => {
      const mockExecutions = [
        { _id: 'e1', workflowId: 'wf-exec-find', status: WorkflowExecutionStatus.COMPLETED },
        { _id: 'e2', workflowId: 'wf-exec-find', status: WorkflowExecutionStatus.FAILED },
      ];
      executionModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockExecutions),
      });

      const executions = await service.findExecutions('wf-exec-find');

      expect(executionModel.find).toHaveBeenCalledWith({ workflowId: 'wf-exec-find' });
      expect(executions).toHaveLength(2);
      const statuses = executions.map((e) => e.status);
      expect(statuses).toContain(WorkflowExecutionStatus.COMPLETED);
      expect(statuses).toContain(WorkflowExecutionStatus.FAILED);
    });
  });
});
