import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { ChannelsModule } from '../channels/channels.module';
import { TemplatesModule } from '../templates/templates.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [
    ChannelsModule,
    TemplatesModule,
    SubscribersModule,
    NotificationsModule,
    EventsModule,
    WorkflowsModule,
    CampaignsModule,
  ],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
