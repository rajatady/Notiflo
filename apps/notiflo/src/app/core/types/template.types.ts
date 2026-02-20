import { Channel } from './channel.types';

export interface ChannelTemplateContent {
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface RenderRequest {
  templateId: string;
  channel: Channel;
  variables: Record<string, unknown>;
}

export interface RenderResult {
  channel: Channel;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateValidationError {
  field: string;
  message: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
}
