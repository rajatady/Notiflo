import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotifloTemplate,
  NotifloTemplateDocument,
} from './schemas/template.schema';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(NotifloTemplate.name)
    private readonly templateModel: Model<NotifloTemplateDocument>,
  ) {}

  async create(
    createTemplateDto: CreateTemplateDto,
  ): Promise<NotifloTemplateDocument> {
    return this.templateModel.create({
      ...createTemplateDto,
      version: 1,
      active: true,
    });
  }

  async findAll(organizationId: string): Promise<NotifloTemplateDocument[]> {
    return this.templateModel.find({ organizationId }).exec();
  }

  async findOne(id: string): Promise<NotifloTemplateDocument | null> {
    return this.templateModel.findById(id).exec();
  }

  async findByTag(
    organizationId: string,
    tag: string,
  ): Promise<NotifloTemplateDocument[]> {
    return this.templateModel
      .find({ organizationId, tags: tag })
      .exec();
  }

  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
  ): Promise<NotifloTemplateDocument | null> {
    return this.templateModel
      .findByIdAndUpdate(
        id,
        {
          ...updateTemplateDto,
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
  }

  async remove(id: string): Promise<NotifloTemplateDocument | null> {
    return this.templateModel.findByIdAndDelete(id).exec();
  }

  async activate(id: string): Promise<NotifloTemplateDocument | null> {
    return this.templateModel
      .findByIdAndUpdate(id, { active: true }, { new: true })
      .exec();
  }

  async deactivate(id: string): Promise<NotifloTemplateDocument | null> {
    return this.templateModel
      .findByIdAndUpdate(id, { active: false }, { new: true })
      .exec();
  }
}
