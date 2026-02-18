export interface NotifloEvent {
  id: string;
  organizationId: string;
  name: string;
  subscriberId?: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  source: EventSource;
  processed: boolean;
}

export enum EventSource {
  API = 'api',
  WEBHOOK = 'webhook',
  SYSTEM = 'system',
  WORKFLOW = 'workflow',
  MCP = 'mcp',
  AGENT = 'agent',
  RUST_ENGINE = 'rust_engine',
}

export interface EventFilter {
  organizationId: string;
  name?: string;
  subscriberId?: string;
  source?: EventSource;
  processed?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface EventSubscription {
  id: string;
  eventName: string;
  handler: (event: NotifloEvent) => Promise<void>;
}
