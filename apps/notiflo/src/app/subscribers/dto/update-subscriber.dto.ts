import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSubscriberDto } from './create-subscriber.dto';

export class UpdateSubscriberDto extends PartialType(
  OmitType(CreateSubscriberDto, ['organizationId', 'externalId'] as const),
) {}
