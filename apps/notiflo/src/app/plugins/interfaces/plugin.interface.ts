import { IChannelProvider } from '../../core';

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}

export interface ICustomChannelPlugin extends IPlugin {
  readonly channel: string;
  getProvider(): IChannelProvider;
}

export enum HookPoint {
  ON_EVENT_INGEST = 'on_event_ingest',
  BEFORE_FANOUT = 'before_fanout',
  BEFORE_RENDER = 'before_render',
  AFTER_RENDER = 'after_render',
  BEFORE_SEND = 'before_send',
  AFTER_SEND = 'after_send',
  ON_STATUS_CHANGE = 'on_status_change',
  ON_CAMPAIGN_STATUS = 'on_campaign_status',
  ON_WORKFLOW_STEP = 'on_workflow_step',
}

export interface IHook {
  readonly name: string;
  readonly hookPoint: HookPoint;
  readonly priority?: number; // lower = runs first, default 100
  execute(context: HookContext): Promise<HookResult>;
}

export interface HookContext {
  hookPoint: HookPoint;
  organizationId: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface HookResult {
  modified: boolean;
  data?: Record<string, unknown>;
  error?: string;
  executionTimeMs?: number;
}
