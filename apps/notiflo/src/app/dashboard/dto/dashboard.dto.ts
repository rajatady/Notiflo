import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export enum TimeRange {
  LAST_HOUR = '1h',
  LAST_24H = '24h',
  LAST_7D = '7d',
  LAST_30D = '30d',
  CUSTOM = 'custom',
}

export class DashboardFiltersDto {
  @IsOptional()
  @IsEnum(TimeRange)
  timeRange?: TimeRange;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;
}

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

export interface TimelinePoint {
  timestamp: string;
  sent: number;
  delivered: number;
  failed: number;
}

export interface ProviderHealth {
  provider: string;
  channel: string;
  status: string;
  circuitBreakerState: string;
  successRate: number;
  avgLatencyMs: number;
  rateLimitRemaining: number;
  lastErrorAt?: string;
  lastError?: string;
}

export interface ActiveCampaignSummary {
  id: string;
  name: string;
  status: string;
  progress: number; // 0-100%
  totalRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  startedAt: string;
}
