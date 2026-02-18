import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertDeliveryListener } from './alert-delivery.listener';
import {
  AlertCondition,
  AlertConditionSchema,
} from './schemas/alert-condition.schema';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AlertCondition.name, schema: AlertConditionSchema },
    ]),
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    { provide: 'AlertsService', useExisting: AlertsService },
    AlertDeliveryListener,
  ],
  exports: [AlertsService, 'AlertsService'],
})
export class AlertsModule {}
