import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RedisStreamConsumer } from './redis-stream.consumer';
import {
  NotificationDocument,
  NotificationSchema,
} from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Notification', schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: 'NotificationsService', useExisting: NotificationsService },
    RedisStreamConsumer,
  ],
  exports: [NotificationsService, 'NotificationsService'],
})
export class NotificationsModule {}
