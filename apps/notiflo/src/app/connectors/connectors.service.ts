import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Connector, ConnectorDocument } from './schemas/connector.schema';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@Injectable()
export class ConnectorsService {
  constructor(
    @InjectModel(Connector.name)
    private readonly connectorModel: Model<ConnectorDocument>,
  ) {}

  async create(dto: CreateConnectorDto): Promise<ConnectorDocument> {
    return this.connectorModel.create(dto);
  }

  async findAll(organizationId: string): Promise<ConnectorDocument[]> {
    return this.connectorModel.find({ organizationId }).exec();
  }

  async findOne(id: string): Promise<ConnectorDocument | null> {
    return this.connectorModel.findById(id).exec();
  }

  async update(
    id: string,
    dto: UpdateConnectorDto,
  ): Promise<ConnectorDocument | null> {
    return this.connectorModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<ConnectorDocument | null> {
    return this.connectorModel.findByIdAndDelete(id).exec();
  }
}
