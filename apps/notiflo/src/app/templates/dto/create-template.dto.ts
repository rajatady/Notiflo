import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChannelTemplateContentDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

class TemplateVariableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['string', 'number', 'boolean', 'date', 'object', 'array'])
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';

  @IsBoolean()
  required: boolean;

  @IsOptional()
  defaultValue?: unknown;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  channels: Record<string, { subject?: string; body: string; metadata?: Record<string, unknown> }>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  @IsOptional()
  variables?: TemplateVariableDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
