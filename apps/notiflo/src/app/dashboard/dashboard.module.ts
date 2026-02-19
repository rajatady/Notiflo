import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  NotificationDocument,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import {
  Subscriber,
  SubscriberSchema,
} from '../subscribers/schemas/subscriber.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationDocument.name, schema: NotificationSchema },
      { name: Subscriber.name, schema: SubscriberSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
