import {IsObject, IsOptional, IsString, ValidateNested} from "class-validator";
import {INotifloPushTemplate} from "../schemas/notiflo.push.template.schema";
import {Type} from 'class-transformer';


export class CreatePushTemplateDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  data?: any;

  @IsString()
  @IsOptional()
  group: string;

  @IsString()
  @IsOptional()
  channelId: string;
}

export class CreateTemplateDto {

  @IsString()
  name: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CreatePushTemplateDto)
  push: INotifloPushTemplate;

  @IsString()
  @IsOptional()
  externalId: string;
}
