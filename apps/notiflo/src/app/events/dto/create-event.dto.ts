import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { EventSource } from '../../core';

export class CreateEventDto {
  @IsString()
  organizationId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  subscriberId?: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsEnum(EventSource)
  source?: EventSource;
}
