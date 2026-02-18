import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
} from 'class-validator';
import { Channel } from '../../core';

export class CreateNotificationDto {
  @IsString()
  organizationId: string;

  @IsString()
  subscriberId: string;

  @IsEnum(Channel)
  channel: Channel;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsString()
  workflowExecutionId?: string;

  @IsString()
  provider: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
