import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  WorkflowExecution,
  WorkflowExecutionStatus,
  StepResult,
  ConditionStepConfig,
  ConditionOperator,
  DelayStepConfig,
  SendStepConfig,
  WebhookStepConfig,
  TriggerStepConfig,
} from '../../core';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  /**
   * Retrieves a nested value from an object using dot-notation path.
   * e.g., getNestedValue({ a: { b: 3 } }, 'a.b') => 3
   */
  getNestedValue(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluates a condition step configuration against the execution context.
   * Returns true if the condition is met, false otherwise.
   */
  evaluateCondition(
    config: ConditionStepConfig,
    context: Record<string, unknown>,
  ): boolean {
    const fieldValue = this.getNestedValue(context, config.field);

    switch (config.operator) {
      case ConditionOperator.EQUALS:
        return fieldValue === config.value;

      case ConditionOperator.NOT_EQUALS:
        return fieldValue !== config.value;

      case ConditionOperator.GREATER_THAN:
        return (
          typeof fieldValue === 'number' &&
          typeof config.value === 'number' &&
          fieldValue > config.value
        );

      case ConditionOperator.LESS_THAN:
        return (
          typeof fieldValue === 'number' &&
          typeof config.value === 'number' &&
          fieldValue < config.value
        );

      case ConditionOperator.CONTAINS:
        return (
          typeof fieldValue === 'string' &&
          typeof config.value === 'string' &&
          fieldValue.includes(config.value)
        );

      case ConditionOperator.NOT_CONTAINS:
        return (
          typeof fieldValue === 'string' &&
          typeof config.value === 'string' &&
          !fieldValue.includes(config.value)
        );

      case ConditionOperator.EXISTS:
        return fieldValue !== undefined && fieldValue !== null;

      case ConditionOperator.NOT_EXISTS:
        return fieldValue === undefined || fieldValue === null;

      case ConditionOperator.IN:
        return Array.isArray(config.value) && config.value.includes(fieldValue);

      case ConditionOperator.REGEX:
        if (typeof fieldValue !== 'string' || typeof config.value !== 'string') {
          return false;
        }
        try {
          const regex = new RegExp(config.value);
          return regex.test(fieldValue);
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * Executes a single workflow step and returns the result.
   */
  async executeStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
  ): Promise<StepResult> {
    const executedAt = new Date();

    try {
      switch (step.type) {
        case WorkflowStepType.TRIGGER:
          return this.executeTriggerStep(step, context, executedAt);

        case WorkflowStepType.CONDITION:
          return this.executeConditionStep(step, context, executedAt);

        case WorkflowStepType.DELAY:
          return this.executeDelayStep(step, context, executedAt);

        case WorkflowStepType.SEND:
          return this.executeSendStep(step, context, executedAt);

        case WorkflowStepType.WEBHOOK:
          return this.executeWebhookStep(step, context, executedAt);

        default:
          return {
            stepId: step.id,
            status: 'failed',
            error: `Unsupported step type: ${step.type}`,
            executedAt,
          };
      }
    } catch (error) {
      return {
        stepId: step.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        executedAt,
      };
    }
  }

  /**
   * Executes an entire workflow definition from entry to end.
   */
  async executeWorkflow(
    definition: WorkflowDefinition,
    subscriberId: string,
    initialContext: Record<string, unknown>,
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}`,
      workflowId: definition.id,
      organizationId: definition.organizationId,
      subscriberId,
      status: WorkflowExecutionStatus.RUNNING,
      currentStepId: definition.entryStepId,
      context: initialContext,
      stepResults: [],
      startedAt: new Date(),
    };

    // Find the entry step
    const entryStep = definition.steps.find(
      (s) => s.id === definition.entryStepId,
    );

    if (!entryStep) {
      execution.status = WorkflowExecutionStatus.FAILED;
      execution.error = `Entry step '${definition.entryStepId}' not found in workflow`;
      execution.completedAt = new Date();
      return execution;
    }

    // Execute steps starting from the entry
    let currentStep: WorkflowStep | undefined = entryStep;

    while (currentStep) {
      execution.currentStepId = currentStep.id;

      const result = await this.executeStep(currentStep, execution.context);
      execution.stepResults.push(result);

      // If step failed, stop execution
      if (result.status === 'failed') {
        execution.status = WorkflowExecutionStatus.FAILED;
        execution.error = `Step '${currentStep.id}' failed: ${result.error}`;
        execution.completedAt = new Date();
        return execution;
      }

      // Determine the next step
      let nextStepId: string | undefined;

      if (currentStep.type === WorkflowStepType.CONDITION) {
        const condConfig = currentStep.config as unknown as ConditionStepConfig;
        const conditionResult = this.evaluateCondition(
          condConfig,
          execution.context,
        );
        nextStepId = conditionResult
          ? condConfig.trueStepId
          : condConfig.falseStepId;
      } else if (currentStep.nextSteps && currentStep.nextSteps.length > 0) {
        // For linear steps, follow the first nextStep
        nextStepId = currentStep.nextSteps[0];
      }

      if (nextStepId) {
        currentStep = definition.steps.find((s) => s.id === nextStepId);
        if (!currentStep) {
          execution.status = WorkflowExecutionStatus.FAILED;
          execution.error = `Next step '${nextStepId}' not found in workflow`;
          execution.completedAt = new Date();
          return execution;
        }
      } else {
        // No more steps - workflow is complete
        currentStep = undefined;
      }
    }

    execution.status = WorkflowExecutionStatus.COMPLETED;
    execution.completedAt = new Date();
    return execution;
  }

  // ---------------------------------------------------------------------------
  // Private step executors
  // ---------------------------------------------------------------------------

  private executeTriggerStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    executedAt: Date,
  ): StepResult {
    const config = step.config as unknown as TriggerStepConfig;
    return {
      stepId: step.id,
      status: 'completed',
      output: {
        triggerType: config.triggerType,
        eventName: config.eventName,
      },
      executedAt,
    };
  }

  private executeConditionStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    executedAt: Date,
  ): StepResult {
    const config = step.config as unknown as ConditionStepConfig;
    const result = this.evaluateCondition(config, context);
    return {
      stepId: step.id,
      status: 'completed',
      output: {
        conditionResult: result,
        nextStepId: result ? config.trueStepId : config.falseStepId,
      },
      executedAt,
    };
  }

  private async executeDelayStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    executedAt: Date,
  ): Promise<StepResult> {
    const config = step.config as unknown as DelayStepConfig;
    const delayMs = this.convertToMs(config.duration, config.unit);

    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

    return {
      stepId: step.id,
      status: 'completed',
      output: {
        delayMs,
        duration: config.duration,
        unit: config.unit,
      },
      executedAt,
    };
  }

  private executeSendStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    executedAt: Date,
  ): StepResult {
    const config = step.config as unknown as SendStepConfig;

    // In a full implementation, this would call the notification service.
    // For now, we record the intent.
    this.logger.log(
      `Sending via channel '${config.channel}' with template '${config.templateId}'`,
    );

    return {
      stepId: step.id,
      status: 'completed',
      output: {
        channel: config.channel,
        templateId: config.templateId,
        providerId: config.providerId,
        subscriberId: context['subscriberId'],
      },
      executedAt,
    };
  }

  private executeWebhookStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    executedAt: Date,
  ): StepResult {
    const config = step.config as unknown as WebhookStepConfig;

    // In a full implementation, this would make an HTTP call.
    // For now, we record the intent.
    this.logger.log(`Webhook ${config.method} ${config.url}`);

    return {
      stepId: step.id,
      status: 'completed',
      output: {
        url: config.url,
        method: config.method,
        headers: config.headers,
      },
      executedAt,
    };
  }

  /**
   * Converts a duration and unit to milliseconds.
   */
  private convertToMs(
    duration: number,
    unit: 'seconds' | 'minutes' | 'hours' | 'days',
  ): number {
    switch (unit) {
      case 'seconds':
        return duration * 1000;
      case 'minutes':
        return duration * 60 * 1000;
      case 'hours':
        return duration * 60 * 60 * 1000;
      case 'days':
        return duration * 24 * 60 * 60 * 1000;
      default:
        return duration * 1000;
    }
  }
}
