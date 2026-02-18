import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { TemplateEngineService } from './engine/template-engine.service';
import {
  NotifloTemplate,
  NotifloTemplateSchema,
} from './schemas/template.schema';
import { TEMPLATE_ENGINE } from '../core';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotifloTemplate.name, schema: NotifloTemplateSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateEngineService,
    {
      provide: TEMPLATE_ENGINE,
      useExisting: TemplateEngineService,
    },
  ],
  exports: [TemplatesService, TemplateEngineService, TEMPLATE_ENGINE],
})
export class TemplatesModule {}
