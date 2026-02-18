/**
 * Channel definitions and per-channel message shapes.
 * Every channel in Notiflo has a strongly-typed message contract.
 */

export enum Channel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WHATSAPP = 'whatsapp',
  IN_APP = 'in_app',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
}

export interface EmailMessage {
  from?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
  from?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  imageUrl?: string;
  tokens: string[];
}

export interface WhatsAppMessage {
  to: string;
  templateName: string;
  language: string;
  parameters?: Record<string, string>;
}

export interface InAppMessage {
  subscriberId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actionUrl?: string;
  avatar?: string;
}

export interface WebhookMessage {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface SlackMessage {
  channelId: string;
  text: string;
  blocks?: unknown[];
}

export type ChannelMessage =
  | EmailMessage
  | SmsMessage
  | PushMessage
  | WhatsAppMessage
  | InAppMessage
  | WebhookMessage
  | SlackMessage;

/**
 * Maps each Channel enum to its strongly-typed message shape.
 * Used by generics to enforce correct message types per channel.
 */
export interface ChannelMessageMap {
  [Channel.EMAIL]: EmailMessage;
  [Channel.SMS]: SmsMessage;
  [Channel.PUSH]: PushMessage;
  [Channel.WHATSAPP]: WhatsAppMessage;
  [Channel.IN_APP]: InAppMessage;
  [Channel.WEBHOOK]: WebhookMessage;
  [Channel.SLACK]: SlackMessage;
}

export enum ProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  RATE_LIMITED = 'rate_limited',
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  providerName: string;
  channel: Channel;
  error?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
