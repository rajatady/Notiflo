import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import {MongooseModule} from "@nestjs/mongoose";
import {NotifloTemplate, NotifloTemplateSchema} from "./schemas/notiflo.template.schema";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
  imports: [
    MongooseModule.forFeature([
      {
        name: NotifloTemplate.name,
        schema: NotifloTemplateSchema
      }
    ])
  ]
})
export class TemplatesModule {}
