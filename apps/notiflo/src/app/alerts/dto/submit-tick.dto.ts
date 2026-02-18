import { IsString, IsNumber, IsOptional } from 'class-validator';

export class SubmitTickDto {
  @IsString()
  symbol: string;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsNumber()
  secondaryValue?: number;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsNumber()
  timestampUs: number;

  @IsOptional()
  @IsString()
  metadata?: string;
}
