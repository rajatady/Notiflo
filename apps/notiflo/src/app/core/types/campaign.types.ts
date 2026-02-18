import { Channel } from './channel.types';

export enum CampaignStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface CampaignDefinition {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  channels: Channel[];
  templateIds: Partial<Record<Channel, string>>;
  targetSegment?: SegmentDefinition;
  schedule?: CampaignSchedule;
  status: CampaignStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  analytics: CampaignAnalytics;
  tags?: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentDefinition {
  filters: SegmentFilter[];
  logic: 'and' | 'or';
}

export interface SegmentFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in' | 'exists' | 'regex';
  value: unknown;
}

export interface CampaignSchedule {
  type: 'immediate' | 'scheduled' | 'recurring';
  scheduledAt?: Date;
  cron?: string;
  timezone?: string;
  endAt?: Date;
}

export interface CampaignAnalytics {
  totalRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

export const emptyCampaignAnalytics: CampaignAnalytics = {
  totalRecipients: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
};
