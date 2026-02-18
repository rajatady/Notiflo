import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { OrganizationsService } from './organizations.service';
import { Organization } from './schemas/organization.schema';
import { ApiKey } from './schemas/api-key.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgModel: any;
  let apiKeyModel: any;

  const createDto: CreateOrganizationDto = {
    name: 'Acme Corp',
    slug: 'acme-corp',
    description: 'A test organization',
  };

  beforeEach(async () => {
    orgModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findOne: jest.fn(),
      deleteMany: jest.fn(),
    };

    apiKeyModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      deleteMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: getModelToken(Organization.name),
          useValue: orgModel,
        },
        {
          provide: getModelToken(ApiKey.name),
          useValue: apiKeyModel,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    it('should create an organization', async () => {
      const mockResult = {
        _id: 'org-id-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        description: 'A test organization',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orgModel.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(createDto);

      expect(orgModel.create).toHaveBeenCalledWith(createDto);
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.name).toBe('Acme Corp');
      expect(result.slug).toBe('acme-corp');
      expect(result.description).toBe('A test organization');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create an organization with minimal fields', async () => {
      const minimalDto: CreateOrganizationDto = {
        name: 'Minimal Org',
        slug: 'minimal-org',
      };

      const mockResult = {
        _id: 'org-id-2',
        name: 'Minimal Org',
        slug: 'minimal-org',
      };
      orgModel.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(minimalDto);

      expect(result).toBeDefined();
      expect(result.name).toBe('Minimal Org');
      expect(result.slug).toBe('minimal-org');
      expect(result.description).toBeUndefined();
    });

    it('should enforce unique slug', async () => {
      orgModel.create.mockRejectedValueOnce(
        new Error('E11000 duplicate key error'),
      );

      await expect(
        service.create({ name: 'Another Org', slug: 'acme-corp' }),
      ).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should find an organization by id', async () => {
      const mockOrg = {
        _id: 'org-id-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
      };
      orgModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockOrg),
      });

      const found = await service.findOne('org-id-1');

      expect(found).toBeDefined();
      expect(found.name).toBe('Acme Corp');
      expect(found.slug).toBe('acme-corp');
    });

    it('should return null for non-existent id', async () => {
      orgModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findOne('507f1f77bcf86cd799439011');
      expect(found).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find an organization by slug', async () => {
      const mockOrg = {
        _id: 'org-id-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
      };
      orgModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockOrg),
      });

      const found = await service.findBySlug('acme-corp');

      expect(orgModel.findOne).toHaveBeenCalledWith({ slug: 'acme-corp' });
      expect(found).toBeDefined();
      expect(found.name).toBe('Acme Corp');
      expect(found.slug).toBe('acme-corp');
    });

    it('should return null for non-existent slug', async () => {
      orgModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findBySlug('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update an organization', async () => {
      const mockUpdated = {
        _id: 'org-id-1',
        name: 'Acme Corp Updated',
        description: 'Updated description',
        slug: 'acme-corp',
      };
      orgModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.update('org-id-1', {
        name: 'Acme Corp Updated',
        description: 'Updated description',
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Acme Corp Updated');
      expect(updated.description).toBe('Updated description');
      expect(updated.slug).toBe('acme-corp');
    });

    it('should return null for non-existent id', async () => {
      orgModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.update('507f1f77bcf86cd799439011', {
        name: 'Does Not Exist',
      });
      expect(result).toBeNull();
    });
  });

  describe('generateApiKey', () => {
    it('should generate an API key for an organization', async () => {
      // We need to intercept the crypto call to know the raw key
      const mockApiKeyDoc = {
        _id: 'apikey-id-1',
        organizationId: 'org-id-1',
        name: 'Production Key',
        key: 'hashed-value',
        prefix: '12345678',
        active: true,
      };
      apiKeyModel.create.mockResolvedValueOnce(mockApiKeyDoc);

      const result = await service.generateApiKey('org-id-1', 'Production Key');

      expect(result).toBeDefined();
      expect(result.rawKey).toBeDefined();
      expect(typeof result.rawKey).toBe('string');
      expect(result.rawKey.length).toBeGreaterThan(0);
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey.name).toBe('Production Key');
      expect(result.apiKey.organizationId).toBe('org-id-1');
      expect(result.apiKey.active).toBe(true);

      // Verify apiKeyModel.create was called with correct structure
      expect(apiKeyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-id-1',
          name: 'Production Key',
          active: true,
        }),
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key and return the organization', async () => {
      const rawKey = 'test-raw-key-for-validation';
      const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

      const mockApiKeyDoc = {
        _id: 'apikey-id-1',
        organizationId: 'org-id-1',
        key: hashedKey,
        active: true,
        lastUsedAt: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };
      apiKeyModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockApiKeyDoc),
      });

      const mockOrg = {
        _id: { toString: () => 'org-id-1' },
        name: 'Acme Corp',
        slug: 'acme-corp',
      };
      orgModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockOrg),
      });

      const validatedOrg = await service.validateApiKey(rawKey);

      expect(validatedOrg).toBeDefined();
      expect(validatedOrg.name).toBe('Acme Corp');
      expect(validatedOrg.slug).toBe('acme-corp');
      expect(apiKeyModel.findOne).toHaveBeenCalledWith({
        key: hashedKey,
        active: true,
      });
    });

    it('should reject an invalid API key', async () => {
      apiKeyModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.validateApiKey('invalid-key-that-does-not-exist');
      expect(result).toBeNull();
    });

    it('should reject a revoked API key', async () => {
      apiKeyModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null), // active: true filter won't match revoked key
      });

      const result = await service.validateApiKey('some-revoked-key');
      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', async () => {
      const mockRevoked = {
        _id: 'apikey-id-1',
        active: false,
      };
      apiKeyModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockRevoked),
      });

      const revoked = await service.revokeApiKey('apikey-id-1');

      expect(apiKeyModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'apikey-id-1',
        { active: false },
        { new: true },
      );
      expect(revoked).toBeDefined();
      expect(revoked.active).toBe(false);
    });
  });

  describe('listApiKeys', () => {
    it('should list all API keys for an organization without showing full key', async () => {
      const mockKeys = [
        { _id: 'k1', name: 'Key 1', prefix: '12345678', organizationId: 'org-id-1' },
        { _id: 'k2', name: 'Key 2', prefix: 'abcdefgh', organizationId: 'org-id-1' },
        { _id: 'k3', name: 'Key 3', prefix: 'xyz12345', organizationId: 'org-id-1' },
      ];
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockKeys),
      };
      apiKeyModel.find.mockReturnValueOnce(mockChain);

      const keys = await service.listApiKeys('org-id-1');

      expect(apiKeyModel.find).toHaveBeenCalledWith({ organizationId: 'org-id-1' });
      expect(mockChain.select).toHaveBeenCalledWith('-key');
      expect(keys).toHaveLength(3);
      keys.forEach((key) => {
        expect(key.name).toBeDefined();
        expect(key.prefix).toBeDefined();
        expect(key.prefix.length).toBe(8);
        expect(key.organizationId).toBe('org-id-1');
        expect(key.key).toBeUndefined();
      });

      const names = keys.map((k) => k.name);
      expect(names).toContain('Key 1');
      expect(names).toContain('Key 2');
      expect(names).toContain('Key 3');
    });

    it('should return empty array for org with no keys', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([]),
      };
      apiKeyModel.find.mockReturnValueOnce(mockChain);

      const keys = await service.listApiKeys('org-id-1');
      expect(keys).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should delete an organization', async () => {
      const mockDeleted = {
        _id: 'org-id-1',
        name: 'Acme Corp',
      };
      orgModel.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDeleted),
      });

      const deleted = await service.remove('org-id-1');
      expect(deleted).toBeDefined();
      expect(deleted.name).toBe('Acme Corp');
    });

    it('should return null for non-existent id', async () => {
      orgModel.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.remove('507f1f77bcf86cd799439011');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all organizations', async () => {
      const mockOrgs = [
        { _id: 'o1', name: 'Acme Corp', slug: 'acme-corp' },
        { _id: 'o2', name: 'Other Org', slug: 'other-org' },
      ];
      orgModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockOrgs),
      });

      const results = await service.findAll();

      expect(results).toHaveLength(2);
    });

    it('should return empty array when no organizations exist', async () => {
      orgModel.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce([]),
      });

      const results = await service.findAll();
      expect(results).toHaveLength(0);
    });
  });
});
