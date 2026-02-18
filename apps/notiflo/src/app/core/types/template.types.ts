import { Channel } from './channel.types';

export interface TemplateDefinition {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  channels: Partial<Record<Channel, ChannelTemplateContent>>;
  variables: TemplateVariable[];
  tags?: string[];
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelTemplateContent {
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
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

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
}

export interface TemplateValidationError {
  field: string;
  message: string;
  channel?: Channel;
}
