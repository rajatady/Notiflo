import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';
import {INotifloPushTemplate, NotifloPushTemplate, NotifloPushTemplateSchema} from "./notiflo.push.template.schema";
import {
  INotifloWhatsappTemplate,
  NotifloWhatsappTemplate,
  NotifloWhatsappTemplateSchema
} from "./notiflo.whatsapp.template.schema";

export type INotifloTemplate = HydratedDocument<NotifloTemplate>;

@Schema({timestamps: true})
export class NotifloTemplate {

  @Prop({type: String, isRequired: true})
  name: string;

  @Prop({type: String, index: true})
  externalId: string;

  @Prop({type: NotifloPushTemplateSchema})
  push: INotifloPushTemplate;

  @Prop({type: NotifloWhatsappTemplateSchema})
  whatsapp: INotifloWhatsappTemplate;
}

export const NotifloTemplateSchema = SchemaFactory.createForClass(NotifloTemplate);
