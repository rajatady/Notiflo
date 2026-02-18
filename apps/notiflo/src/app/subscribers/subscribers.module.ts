import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import {
  Subscriber,
  SubscriberSchema,
} from './schemas/subscriber.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscriber.name, schema: SubscriberSchema },
    ]),
  ],
  controllers: [SubscribersController],
  providers: [
    SubscribersService,
    { provide: 'SubscribersService', useExisting: SubscribersService },
  ],
  exports: [SubscribersService, 'SubscribersService'],
})
export class SubscribersModule {}
