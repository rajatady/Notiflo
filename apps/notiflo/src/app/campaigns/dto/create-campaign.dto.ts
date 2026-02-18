import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { Channel } from '../../core/types/channel.types';
import { SegmentDefinition, CampaignSchedule } from '../../core/types/campaign.types';

export class CreateCampaignDto {
  @IsString()
  organizationId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  channels: Channel[];

  @IsObject()
  templateIds: Record<string, string>;

  @IsOptional()
  targetSegment?: SegmentDefinition;

  @IsOptional()
  schedule?: CampaignSchedule;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsString()
  createdBy: string;
}
