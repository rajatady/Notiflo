import { Module } from '@nestjs/common';
import { CHANNEL_REGISTRY } from '../core';
import { ChannelRegistryService } from './registry/channel-registry.service';
import { ChannelsService } from './channels.service';
import {
  EmailProvider,
  SmsProvider,
  PushProvider,
  InAppProvider,
  WebhookProvider,
} from './providers';

/**
 * Module that provides channel abstraction services.
 * - Registers ChannelRegistryService as the CHANNEL_REGISTRY token
 * - Provides ChannelsService for sending messages
 * - Provides all built-in channel providers
 * - Exports both the registry and the channels service
 */
@Module({
  providers: [
    {
      provide: CHANNEL_REGISTRY,
      useClass: ChannelRegistryService,
    },
    ChannelsService,
    EmailProvider,
    SmsProvider,
    PushProvider,
    InAppProvider,
    WebhookProvider,
  ],
  exports: [CHANNEL_REGISTRY, ChannelsService],
})
export class ChannelsModule {}
