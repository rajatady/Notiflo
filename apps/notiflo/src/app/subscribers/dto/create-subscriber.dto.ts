import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreateSubscriberDto {
  @IsString()
  organizationId: string;

  @IsString()
  externalId: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsArray()
  pushTokens?: string[];

  @IsOptional()
  @IsObject()
  channelPreferences?: Record<string, { enabled: boolean; providerId?: string }>;

  @IsOptional()
  @IsObject()
  customAttributes?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
