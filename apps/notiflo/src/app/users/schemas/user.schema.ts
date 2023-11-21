import {HydratedDocument, Schema as MongooseSchema} from "mongoose";
import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";

export type IUser = HydratedDocument<User>;

@Schema({timestamps: true})
export class User {

  @Prop({type: String})
  name: string;

  @Prop({type: String, index: true})
  externalId: string;

  @Prop({type: String})
  email: string;

  @Prop({type: String})
  phone: string;

  @Prop({type: MongooseSchema.Types.Subdocument})
  customAttributes?: Record<string, unknown>;
}

export const UserSchema = SchemaFactory.createForClass(User);

