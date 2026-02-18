import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  MongooseModule,
  MongooseModuleFactoryOptions,
} from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ChannelsModule } from './channels/channels.module';
import { TemplatesModule } from './templates/templates.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { EventsModule } from './events/events.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { McpModule } from './mcp/mcp.module';
import { PluginsModule } from './plugins/plugins.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NapiBridgeModule } from '@notiflo/bridge/napi-bridge';
import { AlertsModule } from './alerts/alerts.module';

import databaseConfiguration from '../../../../config/database.configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfiguration],
    }),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          uri: configService.get('database.uri'),
        } as MongooseModuleFactoryOptions;
      },
      inject: [ConfigService],
    }),

    // Event system
    EventEmitterModule.forRoot(),

    // Core modules
    ChannelsModule,
    TemplatesModule,
    SubscribersModule,
    EventsModule,
    NotificationsModule,

    // Workflow & campaign management
    WorkflowsModule,
    CampaignsModule,

    // Organization & auth
    OrganizationsModule,

    // Orchestration layer
    OrchestratorModule,

    // AI agent / MCP interface
    McpModule,

    PluginsModule,

    WebhooksModule,

    DashboardModule,

    // Rust engine bridge (napi-rs)
    NapiBridgeModule,

    // Real-time alert conditions
    AlertsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
