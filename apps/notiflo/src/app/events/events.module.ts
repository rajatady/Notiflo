import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventBusService } from './bus/event-bus.service';
import { NotifloEventDocument, NotifloEventSchema } from './schemas/event.schema';
import { EVENT_BUS } from '../core';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotifloEventDocument.name, schema: NotifloEventSchema },
    ]),
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    {
      provide: EVENT_BUS,
      useClass: EventBusService,
    },
  ],
  exports: [EventsService, EVENT_BUS],
})
export class EventsModule {}
