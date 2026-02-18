/**
 * Pipeline message types for Kafka topics.
 *
 * Each stage of the notification pipeline produces/consumes
 * a strongly-typed message that flows through Kafka.
 *
 * NOTE: Channel and NotificationStatus are duplicated here so that the
 * pipeline library does not depend on the application layer (libs must
 * never import from apps in an NX workspace).  Keep these in sync with
 * apps/notiflo/src/app/core/types/.
 */

// ---------------------------------------------------------------------------
// Shared enums (mirrored from app types)
// ---------------------------------------------------------------------------

export enum Channel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WHATSAPP = 'whatsapp',
  IN_APP = 'in_app',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
}

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

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export interface PipelineMessage {
  /** Unique message id (UUIDv4) */
  id: string;
  /** Organisation that owns this notification */
  orgId: string;
  /** ISO-8601 timestamp of when the message was created */
  timestamp: string;
  /** Distributed tracing id carried across all stages */
  traceId: string;
}

// ---------------------------------------------------------------------------
// Stage 1 - Ingest
// ---------------------------------------------------------------------------

export interface IngestMessage extends PipelineMessage {
  /** The application-level event name (e.g. "order.shipped") */
  eventName: string;
  /** Target subscriber identifier */
  subscriberId: string;
  /** Arbitrary event payload forwarded from the caller */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage 2 - Fanout
// ---------------------------------------------------------------------------

export interface FanoutMessage extends PipelineMessage {
  subscriberId: string;
  /** Channels this notification should be delivered on */
  channels: Channel[];
  /** Template ids keyed per channel */
  templateIds: Record<string, string>;
  campaignId?: string;
  workflowId?: string;
  /** Variables to be interpolated into templates */
  variables: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage 3 - Render
// ---------------------------------------------------------------------------

export interface RenderMessage extends PipelineMessage {
  subscriberId: string;
  channel: Channel;
  templateId: string;
  variables: Record<string, unknown>;
  campaignId?: string;
  workflowId?: string;
}

// ---------------------------------------------------------------------------
// Stage 4 - Deliver
// ---------------------------------------------------------------------------

export interface RenderedContent {
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface DeliverMessage extends PipelineMessage {
  subscriberId: string;
  channel: Channel;
  provider: string;
  renderedContent: RenderedContent;
  campaignId?: string;
  workflowId?: string;
}

// ---------------------------------------------------------------------------
// Stage 5 - Status
// ---------------------------------------------------------------------------

export interface StatusMessage extends PipelineMessage {
  notificationId: string;
  subscriberId: string;
  channel: Channel;
  provider: string;
  status: NotificationStatus;
  error?: string;
  campaignId?: string;
  workflowId?: string;
  sentAt?: string;
  deliveredAt?: string;
}

// ---------------------------------------------------------------------------
// Dead-letter
// ---------------------------------------------------------------------------

export interface DeadLetterMessage extends PipelineMessage {
  /** The topic the original message was consumed from */
  originalTopic: string;
  /** Serialised copy of the original message */
  originalMessage: string;
  /** Human-readable error description */
  error: string;
  /** Number of times delivery has been attempted */
  retryCount: number;
  /** ISO-8601 timestamp of the most recent attempt */
  lastAttempt: string;
}

// ---------------------------------------------------------------------------
// Topic constants
// ---------------------------------------------------------------------------

export const PipelineTopics = {
  INGEST: 'notiflo.ingest',
  FANOUT: 'notiflo.fanout',
  RENDER: 'notiflo.render',
  DELIVER: 'notiflo.deliver',
  STATUS: 'notiflo.status',
  DEAD_LETTER: 'notiflo.dead-letter',
} as const;

export type PipelineTopic = (typeof PipelineTopics)[keyof typeof PipelineTopics];
