import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import {
  AlertCondition,
  AlertConditionSchema,
} from './schemas/alert-condition.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AlertCondition.name, schema: AlertConditionSchema },
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
