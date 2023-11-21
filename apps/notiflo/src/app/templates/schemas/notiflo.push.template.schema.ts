import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument, Schema as MongooseSchema} from 'mongoose';

export type INotifloPushTemplate = HydratedDocument<NotifloPushTemplate>;

@Schema()
export class NotifloPushTemplate {
  @Prop({type: String})
  title: string;

  @Prop({type: String})
  body: string;

  @Prop({type: MongooseSchema.Types.Mixed})
  data?: Record<string, unknown>;

  @Prop({type: String})
  group: string;

  @Prop({type: String})
  channelId: string;
}

export const NotifloPushTemplateSchema = SchemaFactory.createForClass(NotifloPushTemplate);
