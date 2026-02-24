import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsObject,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { CONNECTOR_TYPES } from '../schemas/connector.schema';

export class CreateConnectorDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn([...CONNECTOR_TYPES])
  type: string;

  @IsObject()
  @IsNotEmpty()
  config: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
