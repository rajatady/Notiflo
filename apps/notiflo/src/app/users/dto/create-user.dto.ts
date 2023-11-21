import {IsEmail, IsObject, IsOptional, IsString} from "class-validator";

export class CreateUserDto {

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  externalId: string;

  @IsString()
  @IsEmail()
  @IsOptional()
  email: string;

  @IsObject()
  @IsOptional()
  customAttributes: Record<string, unknown>;
}
