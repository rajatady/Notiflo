import {Injectable} from '@nestjs/common';
import {CreateTemplateDto} from './dto/create-template.dto';
import {UpdateTemplateDto} from './dto/update-template.dto';
import {InjectModel} from "@nestjs/mongoose";
import {INotifloTemplate, NotifloTemplate} from "./schemas/notiflo.template.schema";
import {Model} from "mongoose";
import {from} from "rxjs";

@Injectable()
export class TemplatesService {
  constructor(@InjectModel(NotifloTemplate.name)
              private readonly notifloTemplateModel: Model<INotifloTemplate>) {
  }

  create(createTemplateDto: CreateTemplateDto) {
    return from(
      this.notifloTemplateModel.create(createTemplateDto)
    );
  }

  findAll() {
    return from(
      this.notifloTemplateModel.find()
    );
  }

  findOne(id: number) {
    return `This action returns a #${id} template`;
  }

  update(id: number, updateTemplateDto: UpdateTemplateDto) {
    return `This action updates a #${id} template`;
  }

  remove(id: number) {
    return `This action removes a #${id} template`;
  }
}
