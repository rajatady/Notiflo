import { Channel } from './channel.types';

export enum WorkflowStepType {
  TRIGGER = 'trigger',
  CONDITION = 'condition',
  DELAY = 'delay',
  SEND = 'send',
  SPLIT = 'split',
  WEBHOOK = 'webhook',
}

export enum TriggerType {
  EVENT = 'event',
  SCHEDULE = 'schedule',
  MANUAL = 'manual',
  API = 'api',
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  name?: string;
  config: Record<string, unknown>;
  nextSteps?: string[];
}

export interface TriggerStepConfig {
  triggerType: TriggerType;
  eventName?: string;
  schedule?: string;
}

export interface ConditionStepConfig {
  field: string;
  operator: ConditionOperator;
  value: unknown;
  trueStepId: string;
  falseStepId: string;
}

export enum ConditionOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists',
  IN = 'in',
  REGEX = 'regex',
}

export interface DelayStepConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface SendStepConfig {
  channel: Channel;
  templateId: string;
  providerId?: string;
}

export interface WebhookStepConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  bodyTemplate?: string;
}

export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  entryStepId: string;
  active: boolean;
  version: number;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export enum WorkflowExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  WAITING = 'waiting',
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  organizationId: string;
  subscriberId: string;
  status: WorkflowExecutionStatus;
  currentStepId: string;
  context: Record<string, unknown>;
  stepResults: StepResult[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface StepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  executedAt: Date;
}
