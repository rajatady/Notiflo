import { IsEnum } from 'class-validator';
import { NotificationStatus } from '../../core';

export class UpdateStatusDto {
  @IsEnum(NotificationStatus)
  status: NotificationStatus;
}
