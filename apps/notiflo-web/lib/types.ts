export interface DashboardOverview {
  totalNotificationsSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
  activeCampaigns: number;
  activeWorkflows: number;
  totalSubscribers: number;
  recentEvents: number;
  channelBreakdown: Array<{
    channel: string;
    sent: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
  }>;
}

export interface ChannelHealth {
  channel: string;
  status: 'healthy' | 'degraded' | 'down';
  throughputPerSecond: number;
  errorRate: number;
  avgLatencyMs: number;
  activeProviders: number;
  circuitBreakerState: string;
}

export interface EngineStatusResponse {
  available: boolean;
  conditionsLoaded?: number;
  evaluationsPerSecond?: number;
  avgLatencyUs?: number;
}

export interface Alert {
  _id: string;
  organizationId: string;
  subscriberId: string;
  symbol: string;
  strategyType: string;
  strategyParams: Record<string, unknown>;
  channels: string[];
  templateId?: string;
  active: boolean;
  name?: string;
  description?: string;
  createdAt: string;
}

export interface CreateAlertPayload {
  organizationId: string;
  subscriberId: string;
  symbol: string;
  strategyType: string;
  strategyParams: Record<string, unknown>;
  channels: string[];
  templateId?: string;
  active?: boolean;
  cooldownMs?: number;
  name?: string;
  description?: string;
}

export interface SubmitTickPayload {
  symbol: string;
  value: number;
  secondaryValue?: number;
  textContent?: string;
  timestampUs: number;
  metadata?: string;
}

export interface TickResult {
  matches: unknown[];
  count: number;
  engineTimeUs?: number;
  conditionsEvaluated?: number;
}

// --- Load Test types ---

export interface LoadTestConfig {
  scaleSteps: number[];
  ticksPerStep: number;
  symbols: string[];
  strategyType: 'threshold_crossing' | 'expression' | 'script';
  measureDeliveryPipeline: boolean;
  channels: string[];
  organizationId: string;
}

export interface PercentileStats {
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  count: number;
}

export interface ScaleStepResult {
  conditionCount: number;
  ticksEvaluated: number;
  totalMatches: number;
  engineEvaluation: PercentileStats;
  deliveryPipeline?: PercentileStats;
  providerEstimates: Record<string, { minMs: number; maxMs: number }>;
  throughput: {
    ticksPerSecond: number;
    matchesPerSecond: number;
  };
  stepDurationMs: number;
}

export interface LoadTestResult {
  testId: string;
  config: LoadTestConfig;
  steps: ScaleStepResult[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export type LoadTestEvent =
  | { type: 'started'; testId: string; config: LoadTestConfig }
  | { type: 'step_started'; step: number; conditionCount: number }
  | { type: 'step_progress'; step: number; ticksCompleted: number; ticksTotal: number }
  | { type: 'step_completed'; step: number; result: ScaleStepResult }
  | { type: 'completed'; result: LoadTestResult }
  | { type: 'failed'; error: string }
  | { type: 'cancelled' };

// --- Connector types ---

export type ConnectorType = 'redis_stream' | 'redis_queue' | 'websocket' | 'kafka';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error';

export interface Connector {
  _id: string;
  organizationId: string;
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  active: boolean;
  status: ConnectorStatus;
  statusMessage?: string;
  ticksIngested: number;
  lastTickAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectorPayload {
  organizationId: string;
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  active?: boolean;
}

export type NotificationStatus =
  | 'pending'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'opened'
  | 'clicked';

export interface NotificationRecord {
  _id: string;
  organizationId: string;
  subscriberId: string;
  channel: string;
  status: NotificationStatus;
  provider: string;
  content: Record<string, unknown>;
  result?: { success: boolean; messageId?: string; error?: string };
  metadata?: { latencyUs?: number };
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export interface PipelineMetrics {
  ticks_ingested: number;
  ticks_evaluated: number;
  matches_found: number;
  ticks_dropped: number;
  active_connectors: number;
  uptime_secs: number;
  avg_eval_latency_us: number;
  max_eval_latency_us: number;
  avg_delivery_latency_us: number;
  deliveries_completed: number;
  throughput_tps: number;
}
