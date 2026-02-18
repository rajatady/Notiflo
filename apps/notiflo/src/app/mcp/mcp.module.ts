import { Module } from '@nestjs/common';
import { McpToolsService } from './mcp-tools.service';
import { McpController } from './mcp.controller';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { TemplatesModule } from '../templates/templates.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [
    OrchestratorModule,
    TemplatesModule,
    SubscribersModule,
    EventsModule,
    NotificationsModule,
    CampaignsModule,
    WorkflowsModule,
    AlertsModule,
  ],
  controllers: [McpController],
  providers: [McpToolsService],
  exports: [McpToolsService],
})
export class McpModule {}
