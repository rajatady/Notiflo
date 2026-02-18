import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  WorkflowExecutionStatus,
  ConditionOperator,
  TriggerType,
  ConditionStepConfig,
  DelayStepConfig,
  SendStepConfig,
  WebhookStepConfig,
  TriggerStepConfig,
  Channel,
} from '../../core';

describe('WorkflowEngineService', () => {
  let engine: WorkflowEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowEngineService],
    }).compile();

    engine = module.get<WorkflowEngineService>(WorkflowEngineService);
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Helper: build a minimal WorkflowDefinition
  // ---------------------------------------------------------------------------
  function buildWorkflow(
    steps: WorkflowStep[],
    entryStepId: string,
  ): WorkflowDefinition {
    return {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Test Workflow',
      steps,
      entryStepId,
      active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ===========================================================================
  // evaluateCondition
  // ===========================================================================
  describe('evaluateCondition', () => {
    it('should evaluate EQUALS operator correctly (true)', () => {
      const config: ConditionStepConfig = {
        field: 'status',
        operator: ConditionOperator.EQUALS,
        value: 'active',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      const result = engine.evaluateCondition(config, { status: 'active' });
      expect(result).toBe(true);
    });

    it('should evaluate EQUALS operator correctly (false)', () => {
      const config: ConditionStepConfig = {
        field: 'status',
        operator: ConditionOperator.EQUALS,
        value: 'active',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      const result = engine.evaluateCondition(config, { status: 'inactive' });
      expect(result).toBe(false);
    });

    it('should evaluate NOT_EQUALS operator', () => {
      const config: ConditionStepConfig = {
        field: 'role',
        operator: ConditionOperator.NOT_EQUALS,
        value: 'admin',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { role: 'user' })).toBe(true);
      expect(engine.evaluateCondition(config, { role: 'admin' })).toBe(false);
    });

    it('should evaluate GREATER_THAN operator', () => {
      const config: ConditionStepConfig = {
        field: 'age',
        operator: ConditionOperator.GREATER_THAN,
        value: 18,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { age: 25 })).toBe(true);
      expect(engine.evaluateCondition(config, { age: 18 })).toBe(false);
      expect(engine.evaluateCondition(config, { age: 10 })).toBe(false);
    });

    it('should evaluate LESS_THAN operator', () => {
      const config: ConditionStepConfig = {
        field: 'score',
        operator: ConditionOperator.LESS_THAN,
        value: 50,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { score: 30 })).toBe(true);
      expect(engine.evaluateCondition(config, { score: 50 })).toBe(false);
      expect(engine.evaluateCondition(config, { score: 80 })).toBe(false);
    });

    it('should evaluate CONTAINS operator', () => {
      const config: ConditionStepConfig = {
        field: 'email',
        operator: ConditionOperator.CONTAINS,
        value: '@gmail.com',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(
        engine.evaluateCondition(config, { email: 'user@gmail.com' }),
      ).toBe(true);
      expect(
        engine.evaluateCondition(config, { email: 'user@yahoo.com' }),
      ).toBe(false);
    });

    it('should evaluate NOT_CONTAINS operator', () => {
      const config: ConditionStepConfig = {
        field: 'tags',
        operator: ConditionOperator.NOT_CONTAINS,
        value: 'spam',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(
        engine.evaluateCondition(config, { tags: 'important, urgent' }),
      ).toBe(true);
      expect(
        engine.evaluateCondition(config, { tags: 'spam, junk' }),
      ).toBe(false);
    });

    it('should evaluate EXISTS operator', () => {
      const config: ConditionStepConfig = {
        field: 'phone',
        operator: ConditionOperator.EXISTS,
        value: null,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(
        engine.evaluateCondition(config, { phone: '+1234567890' }),
      ).toBe(true);
      expect(
        engine.evaluateCondition(config, { email: 'test@test.com' }),
      ).toBe(false);
    });

    it('should evaluate NOT_EXISTS operator', () => {
      const config: ConditionStepConfig = {
        field: 'deletedAt',
        operator: ConditionOperator.NOT_EXISTS,
        value: null,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { name: 'Test' })).toBe(true);
      expect(
        engine.evaluateCondition(config, {
          name: 'Test',
          deletedAt: '2024-01-01',
        }),
      ).toBe(false);
    });

    it('should evaluate IN operator (value in array)', () => {
      const config: ConditionStepConfig = {
        field: 'country',
        operator: ConditionOperator.IN,
        value: ['US', 'UK', 'CA'],
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { country: 'US' })).toBe(true);
      expect(engine.evaluateCondition(config, { country: 'UK' })).toBe(true);
      expect(engine.evaluateCondition(config, { country: 'DE' })).toBe(false);
    });

    it('should evaluate REGEX operator', () => {
      const config: ConditionStepConfig = {
        field: 'email',
        operator: ConditionOperator.REGEX,
        value: '^[a-zA-Z0-9]+@example\\.com$',
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(
        engine.evaluateCondition(config, { email: 'user@example.com' }),
      ).toBe(true);
      expect(
        engine.evaluateCondition(config, { email: 'user@other.com' }),
      ).toBe(false);
    });

    it('should handle nested field access in conditions (e.g., "payload.user.age")', () => {
      const config: ConditionStepConfig = {
        field: 'payload.user.age',
        operator: ConditionOperator.GREATER_THAN,
        value: 21,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      const context = { payload: { user: { age: 30 } } };
      expect(engine.evaluateCondition(config, context)).toBe(true);

      const youngContext = { payload: { user: { age: 18 } } };
      expect(engine.evaluateCondition(config, youngContext)).toBe(false);
    });

    it('should return false for EXISTS when nested path does not exist', () => {
      const config: ConditionStepConfig = {
        field: 'payload.user.name',
        operator: ConditionOperator.EXISTS,
        value: null,
        trueStepId: 'step-true',
        falseStepId: 'step-false',
      };
      expect(engine.evaluateCondition(config, { payload: {} })).toBe(false);
    });
  });

  // ===========================================================================
  // getNestedValue
  // ===========================================================================
  describe('getNestedValue', () => {
    it('should return top-level value', () => {
      expect(engine.getNestedValue({ name: 'Alice' }, 'name')).toBe('Alice');
    });

    it('should return nested value by dot path', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(engine.getNestedValue(obj, 'a.b.c')).toBe(42);
    });

    it('should return undefined for non-existent path', () => {
      expect(engine.getNestedValue({ a: 1 }, 'b.c')).toBeUndefined();
    });

    it('should return undefined when intermediate value is null', () => {
      expect(
        engine.getNestedValue({ a: null }, 'a.b'),
      ).toBeUndefined();
    });
  });

  // ===========================================================================
  // executeStep
  // ===========================================================================
  describe('executeStep', () => {
    it('should execute a trigger step and return completed result', async () => {
      const step: WorkflowStep = {
        id: 'trigger-1',
        type: WorkflowStepType.TRIGGER,
        name: 'Start Trigger',
        config: {
          triggerType: TriggerType.EVENT,
          eventName: 'user.signup',
        } as unknown as Record<string, unknown>,
      };
      const result = await engine.executeStep(step, {});
      expect(result.stepId).toBe('trigger-1');
      expect(result.status).toBe('completed');
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it('should execute a send step by calling the notification send function', async () => {
      const step: WorkflowStep = {
        id: 'send-1',
        type: WorkflowStepType.SEND,
        name: 'Send Email',
        config: {
          channel: Channel.EMAIL,
          templateId: 'tmpl-1',
          providerId: 'provider-1',
        } as unknown as Record<string, unknown>,
      };
      const context = { subscriberId: 'sub-1', payload: { name: 'Alice' } };
      const result = await engine.executeStep(step, context);
      expect(result.stepId).toBe('send-1');
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.output!['channel']).toBe(Channel.EMAIL);
      expect(result.output!['templateId']).toBe('tmpl-1');
    });

    it('should execute a delay step (resolves after converting duration to ms)', async () => {
      const step: WorkflowStep = {
        id: 'delay-1',
        type: WorkflowStepType.DELAY,
        name: 'Wait 1 second',
        config: {
          duration: 1,
          unit: 'seconds',
        } as unknown as Record<string, unknown>,
      };

      // We mock setTimeout to avoid real delays in tests
      jest.useFakeTimers();
      const promise = engine.executeStep(step, {});
      jest.advanceTimersByTime(1000);
      const result = await promise;

      expect(result.stepId).toBe('delay-1');
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.output!['delayMs']).toBe(1000);

      jest.useRealTimers();
    });

    it('should convert delay units correctly', async () => {
      const minuteStep: WorkflowStep = {
        id: 'delay-m',
        type: WorkflowStepType.DELAY,
        config: {
          duration: 2,
          unit: 'minutes',
        } as unknown as Record<string, unknown>,
      };

      jest.useFakeTimers();
      const promise = engine.executeStep(minuteStep, {});
      jest.advanceTimersByTime(120000);
      const result = await promise;
      expect(result.output!['delayMs']).toBe(120000);
      jest.useRealTimers();
    });

    it('should execute a webhook step', async () => {
      const step: WorkflowStep = {
        id: 'webhook-1',
        type: WorkflowStepType.WEBHOOK,
        name: 'Call API',
        config: {
          url: 'https://api.example.com/hook',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          bodyTemplate: '{"userId": "{{subscriberId}}"}',
        } as unknown as Record<string, unknown>,
      };
      const context = { subscriberId: 'sub-1' };
      const result = await engine.executeStep(step, context);
      expect(result.stepId).toBe('webhook-1');
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.output!['url']).toBe('https://api.example.com/hook');
      expect(result.output!['method']).toBe('POST');
    });

    it('should build a step execution result for each step', async () => {
      const step: WorkflowStep = {
        id: 'trigger-1',
        type: WorkflowStepType.TRIGGER,
        config: {
          triggerType: TriggerType.MANUAL,
        } as unknown as Record<string, unknown>,
      };
      const result = await engine.executeStep(step, {});
      expect(result).toHaveProperty('stepId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('executedAt');
      expect(typeof result.stepId).toBe('string');
      expect(['completed', 'failed', 'skipped']).toContain(result.status);
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it('should handle step execution failure gracefully (mark step failed)', async () => {
      // A step with an unrecognised type should fail gracefully
      const step: WorkflowStep = {
        id: 'bad-step',
        type: 'unknown_type' as WorkflowStepType,
        config: {},
      };
      const result = await engine.executeStep(step, {});
      expect(result.stepId).toBe('bad-step');
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // executeWorkflow - linear
  // ===========================================================================
  describe('executeWorkflow', () => {
    it('should execute a simple linear workflow (trigger -> send)', async () => {
      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.EVENT,
            eventName: 'order.created',
          } as unknown as Record<string, unknown>,
          nextSteps: ['send-1'],
        },
        {
          id: 'send-1',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.EMAIL,
            templateId: 'tmpl-order',
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');
      const execution = await engine.executeWorkflow(
        workflow,
        'sub-1',
        { orderId: '123' },
      );

      expect(execution.workflowId).toBe('wf-1');
      expect(execution.organizationId).toBe('org-1');
      expect(execution.subscriberId).toBe('sub-1');
      expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(execution.stepResults).toHaveLength(2);
      expect(execution.stepResults[0].stepId).toBe('trigger-1');
      expect(execution.stepResults[0].status).toBe('completed');
      expect(execution.stepResults[1].stepId).toBe('send-1');
      expect(execution.stepResults[1].status).toBe('completed');
      expect(execution.completedAt).toBeInstanceOf(Date);
    });

    it('should support branching via condition steps (true path)', async () => {
      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.EVENT,
            eventName: 'user.action',
          } as unknown as Record<string, unknown>,
          nextSteps: ['condition-1'],
        },
        {
          id: 'condition-1',
          type: WorkflowStepType.CONDITION,
          config: {
            field: 'payload.vip',
            operator: ConditionOperator.EQUALS,
            value: true,
            trueStepId: 'send-vip',
            falseStepId: 'send-regular',
          } as unknown as Record<string, unknown>,
        },
        {
          id: 'send-vip',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.EMAIL,
            templateId: 'tmpl-vip',
          } as unknown as Record<string, unknown>,
        },
        {
          id: 'send-regular',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.SMS,
            templateId: 'tmpl-regular',
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');

      // VIP user -> should take true path
      const execution = await engine.executeWorkflow(
        workflow,
        'sub-vip',
        { payload: { vip: true } },
      );

      expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(execution.stepResults).toHaveLength(3); // trigger, condition, send-vip
      const stepIds = execution.stepResults.map((r) => r.stepId);
      expect(stepIds).toContain('trigger-1');
      expect(stepIds).toContain('condition-1');
      expect(stepIds).toContain('send-vip');
      expect(stepIds).not.toContain('send-regular');
    });

    it('should support branching via condition steps (false path)', async () => {
      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.EVENT,
            eventName: 'user.action',
          } as unknown as Record<string, unknown>,
          nextSteps: ['condition-1'],
        },
        {
          id: 'condition-1',
          type: WorkflowStepType.CONDITION,
          config: {
            field: 'payload.vip',
            operator: ConditionOperator.EQUALS,
            value: true,
            trueStepId: 'send-vip',
            falseStepId: 'send-regular',
          } as unknown as Record<string, unknown>,
        },
        {
          id: 'send-vip',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.EMAIL,
            templateId: 'tmpl-vip',
          } as unknown as Record<string, unknown>,
        },
        {
          id: 'send-regular',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.SMS,
            templateId: 'tmpl-regular',
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');

      // Non-VIP user -> should take false path
      const execution = await engine.executeWorkflow(
        workflow,
        'sub-normal',
        { payload: { vip: false } },
      );

      expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
      const stepIds = execution.stepResults.map((r) => r.stepId);
      expect(stepIds).toContain('send-regular');
      expect(stepIds).not.toContain('send-vip');
    });

    it('should stop execution when a step fails', async () => {
      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.EVENT,
            eventName: 'test',
          } as unknown as Record<string, unknown>,
          nextSteps: ['bad-step'],
        },
        {
          id: 'bad-step',
          type: 'unknown_type' as WorkflowStepType,
          config: {},
          nextSteps: ['send-1'],
        },
        {
          id: 'send-1',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.EMAIL,
            templateId: 'tmpl-1',
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');
      const execution = await engine.executeWorkflow(workflow, 'sub-1', {});

      expect(execution.status).toBe(WorkflowExecutionStatus.FAILED);
      expect(execution.error).toBeDefined();
      // Should have executed trigger-1 successfully, then bad-step failed
      expect(execution.stepResults).toHaveLength(2);
      expect(execution.stepResults[0].status).toBe('completed');
      expect(execution.stepResults[1].status).toBe('failed');
      // send-1 should NOT have been executed
      const stepIds = execution.stepResults.map((r) => r.stepId);
      expect(stepIds).not.toContain('send-1');
    });

    it('should handle workflow with no steps gracefully', async () => {
      const workflow = buildWorkflow([], 'nonexistent');
      const execution = await engine.executeWorkflow(workflow, 'sub-1', {});

      expect(execution.status).toBe(WorkflowExecutionStatus.FAILED);
      expect(execution.error).toBeDefined();
      expect(execution.stepResults).toHaveLength(0);
    });

    it('should execute a workflow with a delay step', async () => {
      jest.useFakeTimers();

      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.MANUAL,
          } as unknown as Record<string, unknown>,
          nextSteps: ['delay-1'],
        },
        {
          id: 'delay-1',
          type: WorkflowStepType.DELAY,
          config: {
            duration: 5,
            unit: 'seconds',
          } as unknown as Record<string, unknown>,
          nextSteps: ['send-1'],
        },
        {
          id: 'send-1',
          type: WorkflowStepType.SEND,
          config: {
            channel: Channel.PUSH,
            templateId: 'tmpl-push',
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');
      const promise = engine.executeWorkflow(workflow, 'sub-1', {});

      // Allow microtasks to process so the trigger step completes
      // and the delay step's setTimeout is registered
      await jest.advanceTimersByTimeAsync(5000);

      const execution = await promise;
      expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(execution.stepResults).toHaveLength(3);

      jest.useRealTimers();
    });

    it('should record context in the execution', async () => {
      const steps: WorkflowStep[] = [
        {
          id: 'trigger-1',
          type: WorkflowStepType.TRIGGER,
          config: {
            triggerType: TriggerType.API,
          } as unknown as Record<string, unknown>,
        },
      ];

      const workflow = buildWorkflow(steps, 'trigger-1');
      const initialContext = { foo: 'bar', nested: { key: 'val' } };
      const execution = await engine.executeWorkflow(
        workflow,
        'sub-1',
        initialContext,
      );

      expect(execution.context).toEqual(initialContext);
    });
  });
});
