import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  NotificationDocument,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';
import { Workflow, WorkflowSchema } from '../workflows/schemas/workflow.schema';
import {
  WorkflowExecution,
  WorkflowExecutionSchema,
} from '../workflows/schemas/workflow-execution.schema';
import {
  Subscriber,
  SubscriberSchema,
} from '../subscribers/schemas/subscriber.schema';
import {
  NotifloEventDocument,
  NotifloEventSchema,
} from '../events/schemas/event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationDocument.name, schema: NotificationSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowExecution.name, schema: WorkflowExecutionSchema },
      { name: Subscriber.name, schema: SubscriberSchema },
      { name: NotifloEventDocument.name, schema: NotifloEventSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
