import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';

export class IngestEventDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  subscriberId?: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ProviderWebhookDto {
  @IsString()
  provider: string;

  @IsString()
  messageId: string;

  @IsString()
  status: string; // delivered, bounced, opened, clicked, complained, etc.

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  timestamp?: string;
}

export class WebhookConfigDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  secret?: string; // For HMAC signature validation

  @IsOptional()
  events?: string[]; // Event names to forward

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  active?: boolean;
}
