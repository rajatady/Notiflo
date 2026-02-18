import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(ApiKey.name)
    private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  async create(
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<OrganizationDocument> {
    return this.organizationModel.create(createOrganizationDto);
  }

  async findAll(): Promise<OrganizationDocument[]> {
    return this.organizationModel.find().exec();
  }

  async findOne(id: string): Promise<OrganizationDocument | null> {
    return this.organizationModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<OrganizationDocument | null> {
    return this.organizationModel.findOne({ slug }).exec();
  }

  async update(
    id: string,
    updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<OrganizationDocument | null> {
    return this.organizationModel
      .findByIdAndUpdate(id, updateOrganizationDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<OrganizationDocument | null> {
    return this.organizationModel.findByIdAndDelete(id).exec();
  }

  /**
   * Generates a random API key, stores its SHA-256 hash, and returns
   * the raw key exactly once. The raw key cannot be retrieved afterward.
   */
  async generateApiKey(
    orgId: string,
    keyName: string,
  ): Promise<{ rawKey: string; apiKey: ApiKeyDocument }> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex');
    const prefix = rawKey.substring(0, 8);

    const apiKey = await this.apiKeyModel.create({
      organizationId: orgId,
      name: keyName,
      key: hashedKey,
      prefix,
      active: true,
    });

    return { rawKey, apiKey };
  }

  /**
   * Validates a raw API key by hashing it and looking up the hash.
   * Returns the associated organization if valid, null otherwise.
   */
  async validateApiKey(
    rawKey: string,
  ): Promise<OrganizationDocument | null> {
    const hashedKey = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex');

    const apiKeyDoc = await this.apiKeyModel
      .findOne({ key: hashedKey, active: true })
      .exec();

    if (!apiKeyDoc) {
      return null;
    }

    // Update lastUsedAt
    apiKeyDoc.lastUsedAt = new Date();
    await apiKeyDoc.save();

    return this.organizationModel
      .findById(apiKeyDoc.organizationId)
      .exec();
  }

  /**
   * Revokes an API key by setting active to false.
   */
  async revokeApiKey(keyId: string): Promise<ApiKeyDocument | null> {
    return this.apiKeyModel
      .findByIdAndUpdate(keyId, { active: false }, { new: true })
      .exec();
  }

  /**
   * Lists all API keys for an organization, excluding the full hashed key.
   */
  async listApiKeys(orgId: string): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({ organizationId: orgId })
      .select('-key')
      .exec();
  }
}
