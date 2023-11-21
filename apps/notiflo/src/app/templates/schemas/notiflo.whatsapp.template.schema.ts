import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument, Schema as MongooseSchema} from 'mongoose';
import {convertEnumToArray} from "../../utils/array.utils";
import {EWhatsAppLanguage} from "./notiflo.templates.utils";

export type INotifloWhatsappTemplate = HydratedDocument<NotifloWhatsappTemplate>;

@Schema()
export class NotifloWhatsappTemplate {
  @Prop({type: String})
  templateName: string;

  @Prop({type: String})
  templateBody: string;

  @Prop({type: String, enum: convertEnumToArray(EWhatsAppLanguage)})
  language: EWhatsAppLanguage;
}

export const NotifloWhatsappTemplateSchema = SchemaFactory.createForClass(NotifloWhatsappTemplate);
