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
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NapiBridgeModule } from '@notiflo/bridge/napi-bridge';
import { AlertsModule } from './alerts/alerts.module';
import { ConnectorsModule } from './connectors/connectors.module';

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
    NotificationsModule,

    // Organization & auth
    OrganizationsModule,

    // Dashboard
    DashboardModule,

    // Rust engine bridge (napi-rs) — config push to engine
    NapiBridgeModule,

    // Real-time alert conditions
    AlertsModule,

    // Data source connectors
    ConnectorsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
