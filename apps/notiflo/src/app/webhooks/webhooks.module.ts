import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WebhooksController,
  ProviderWebhooksController,
} from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import {
  WebhookConfigDocument,
  WebhookConfigSchema,
} from './schemas/webhook-config.schema';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookConfigDocument.name, schema: WebhookConfigSchema },
    ]),
    EventsModule,
  ],
  controllers: [WebhooksController, ProviderWebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
