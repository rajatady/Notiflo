import { Channel } from './channel.types';

export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  OPENED = 'opened',
  CLICKED = 'clicked',
}

export interface NotificationRecord {
  id: string;
  organizationId: string;
  subscriberId: string;
  channel: Channel;
  templateId?: string;
  campaignId?: string;
  workflowId?: string;
  workflowExecutionId?: string;
  status: NotificationStatus;
  provider: string;
  content: Record<string, unknown>;
  result?: {
    success: boolean;
    messageId?: string;
    error?: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
}

export interface NotificationQuery {
  organizationId: string;
  subscriberId?: string;
  channel?: Channel;
  status?: NotificationStatus;
  campaignId?: string;
  workflowId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  total: number;
  byStatus: Record<NotificationStatus, number>;
  byChannel: Record<Channel, number>;
}
