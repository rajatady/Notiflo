import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AlertCondition,
  AlertConditionDocument,
} from './schemas/alert-condition.schema';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { EngineBridgeService } from '@notiflo/bridge/napi-bridge';
import { AlertConditionInput } from '@notiflo/bridge/napi-bridge';

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(AlertCondition.name)
    private readonly alertModel: Model<AlertConditionDocument>,
    private readonly engineBridge: EngineBridgeService,
  ) {}

  /**
   * On startup, load all active conditions from MongoDB into the Rust engine.
   */
  async onModuleInit() {
    if (!this.engineBridge.isInitialized()) {
      this.logger.warn('Engine bridge not initialized — skipping bulk load');
      return;
    }

    const activeConditions = await this.alertModel
      .find({ active: true })
      .lean()
      .exec();

    if (activeConditions.length === 0) {
      this.logger.log('No active conditions to load');
      return;
    }

    const inputs: AlertConditionInput[] = activeConditions.map((doc) =>
      this.toEngineInput(doc),
    );

    const loaded = this.engineBridge.bulkLoadConditions(inputs);
    this.logger.log(
      `Bulk loaded ${loaded} conditions into Rust engine (${activeConditions.length} from MongoDB)`,
    );
  }

  async create(dto: CreateAlertDto): Promise<AlertConditionDocument> {
    const doc = await this.alertModel.create(dto);

    // Sync to Rust engine if active
    if (doc.active !== false) {
      try {
        this.engineBridge.addCondition(this.toEngineInput(doc));
      } catch (err) {
        this.logger.error('Failed to sync condition to engine', err);
      }
    }

    return doc;
  }

  async findAll(
    organizationId: string,
    limit?: number,
    offset?: number,
  ): Promise<AlertConditionDocument[]> {
    const query = this.alertModel.find({ organizationId });
    if (offset) query.skip(offset);
    if (limit) query.limit(limit);
    return query.exec();
  }

  async findOne(id: string): Promise<AlertConditionDocument | null> {
    return this.alertModel.findById(id).exec();
  }

  async findBySymbol(
    organizationId: string,
    symbol: string,
  ): Promise<AlertConditionDocument[]> {
    return this.alertModel.find({ organizationId, symbol }).exec();
  }

  async findBySubscriber(
    organizationId: string,
    subscriberId: string,
  ): Promise<AlertConditionDocument[]> {
    return this.alertModel.find({ organizationId, subscriberId }).exec();
  }

  async update(
    id: string,
    dto: UpdateAlertDto,
  ): Promise<AlertConditionDocument | null> {
    const doc = await this.alertModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (doc) {
      try {
        this.engineBridge.updateCondition(this.toEngineInput(doc));
      } catch (err) {
        this.logger.error('Failed to sync condition update to engine', err);
      }
    }

    return doc;
  }

  async remove(id: string): Promise<AlertConditionDocument | null> {
    const doc = await this.alertModel.findByIdAndDelete(id).exec();

    if (doc) {
      try {
        this.engineBridge.removeCondition(doc._id.toString());
      } catch (err) {
        this.logger.error('Failed to remove condition from engine', err);
      }
    }

    return doc;
  }

  async toggleActive(
    id: string,
    active: boolean,
  ): Promise<AlertConditionDocument | null> {
    const doc = await this.alertModel
      .findByIdAndUpdate(id, { active }, { new: true })
      .exec();

    if (doc) {
      try {
        if (active) {
          this.engineBridge.addCondition(this.toEngineInput(doc));
        } else {
          this.engineBridge.removeCondition(doc._id.toString());
        }
      } catch (err) {
        this.logger.error('Failed to toggle condition in engine', err);
      }
    }

    return doc;
  }

  getEngineMetrics() {
    return this.engineBridge.getMetrics();
  }

  getEngineConditionCount(): number {
    return this.engineBridge.getConditionCount();
  }

  private toEngineInput(doc: any): AlertConditionInput {
    return {
      id: doc._id.toString(),
      organizationId: doc.organizationId,
      subscriberId: doc.subscriberId,
      symbol: doc.symbol,
      strategyType: doc.strategyType,
      strategyParams: JSON.stringify(doc.strategyParams),
      channels: doc.channels,
      templateId: doc.templateId,
      active: doc.active,
      cooldownMs: doc.cooldownMs,
    };
  }
}
