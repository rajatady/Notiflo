import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SubscribersService } from './subscribers.service';
import { Subscriber } from './schemas/subscriber.schema';
import { Channel } from '../core';

describe('SubscribersService', () => {
  let service: SubscribersService;
  let model: any;

  const orgId = 'org-test-123';
  const otherOrgId = 'org-other-456';

  const createSubscriberDto = {
    organizationId: orgId,
    externalId: 'ext-user-001',
    email: 'john@example.com',
    phone: '+1234567890',
    name: 'John Doe',
    locale: 'en',
    timezone: 'America/New_York',
    pushTokens: ['token-abc-123'],
    channelPreferences: {
      [Channel.EMAIL]: { enabled: true, providerId: 'sendgrid' },
      [Channel.SMS]: { enabled: false },
      [Channel.PUSH]: { enabled: true },
    },
    customAttributes: {
      plan: 'premium',
      signupDate: '2025-01-15',
      age: 30,
    },
    tags: ['vip', 'beta-user'],
  };

  beforeEach(async () => {
    const mockQueryChain = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    model = {
      create: jest.fn(),
      find: jest.fn().mockReturnValue(mockQueryChain),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findOne: jest.fn(),
      deleteMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersService,
        {
          provide: getModelToken(Subscriber.name),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get<SubscribersService>(SubscribersService);
  });

  describe('create', () => {
    it('should create a subscriber with all fields', async () => {
      const mockResult = {
        _id: 'mock-sub-id-1',
        ...createSubscriberDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      model.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(createSubscriberDto);

      expect(model.create).toHaveBeenCalledWith(createSubscriberDto);
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.organizationId).toBe(orgId);
      expect(result.externalId).toBe('ext-user-001');
      expect(result.email).toBe('john@example.com');
      expect(result.phone).toBe('+1234567890');
      expect(result.name).toBe('John Doe');
      expect(result.locale).toBe('en');
      expect(result.timezone).toBe('America/New_York');
      expect(result.pushTokens).toEqual(['token-abc-123']);
      expect(result.tags).toEqual(['vip', 'beta-user']);
      expect(result.customAttributes).toMatchObject({
        plan: 'premium',
        signupDate: '2025-01-15',
        age: 30,
      });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create a subscriber with minimal fields (just externalId + organizationId)', async () => {
      const minimalDto = {
        organizationId: orgId,
        externalId: 'ext-minimal-001',
      };

      const mockResult = {
        _id: 'mock-sub-id-2',
        ...minimalDto,
        locale: 'en',
      };
      model.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(minimalDto);

      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.organizationId).toBe(orgId);
      expect(result.externalId).toBe('ext-minimal-001');
      expect(result.locale).toBe('en');
      expect(result.email).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.name).toBeUndefined();
    });

    it('should handle duplicate externalId within same org gracefully', async () => {
      model.create.mockRejectedValueOnce(
        new Error('E11000 duplicate key error'),
      );

      await expect(
        service.create({
          organizationId: orgId,
          externalId: 'ext-user-001',
          email: 'different@example.com',
        }),
      ).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should find a subscriber by id', async () => {
      const mockFound = {
        _id: 'mock-sub-id-1',
        externalId: 'ext-user-001',
        email: 'john@example.com',
        organizationId: orgId,
      };
      model.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockFound),
      });

      const found = await service.findOne('mock-sub-id-1');

      expect(model.findById).toHaveBeenCalledWith('mock-sub-id-1');
      expect(found).toBeDefined();
      expect(found.externalId).toBe('ext-user-001');
      expect(found.email).toBe('john@example.com');
      expect(found.organizationId).toBe(orgId);
    });
  });

  describe('findByExternalId', () => {
    it('should find a subscriber by externalId and organizationId', async () => {
      const mockFound = {
        _id: 'mock-sub-id-1',
        externalId: 'ext-user-001',
        organizationId: orgId,
        email: 'john@example.com',
      };
      model.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockFound),
      });

      const found = await service.findByExternalId(orgId, 'ext-user-001');

      expect(model.findOne).toHaveBeenCalledWith({
        organizationId: orgId,
        externalId: 'ext-user-001',
      });
      expect(found).toBeDefined();
      expect(found.externalId).toBe('ext-user-001');
      expect(found.organizationId).toBe(orgId);
      expect(found.email).toBe('john@example.com');
    });

    it('should not find subscribers from other organizations', async () => {
      model.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findByExternalId(otherOrgId, 'ext-user-001');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all subscribers for an organization', async () => {
      const mockResults = [
        { _id: 's1', organizationId: orgId, externalId: 'ext-user-001' },
        { _id: 's2', organizationId: orgId, externalId: 'ext-user-002' },
      ];
      const mockExec = jest.fn().mockResolvedValueOnce(mockResults);
      const mockChain = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: mockExec,
      };
      model.find.mockReturnValueOnce(mockChain);

      const results = await service.findAll(orgId);

      expect(model.find).toHaveBeenCalledWith({ organizationId: orgId });
      expect(results).toHaveLength(2);
      expect(results.every((s) => s.organizationId === orgId)).toBe(true);
    });

    it('should support pagination with limit and offset', async () => {
      const mockPage1 = [
        { _id: 's1', organizationId: orgId },
        { _id: 's2', organizationId: orgId },
      ];
      const mockExec = jest.fn().mockResolvedValueOnce(mockPage1);
      const mockChain = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: mockExec,
      };
      model.find.mockReturnValueOnce(mockChain);

      const page1 = await service.findAll(orgId, 2, 0);

      expect(mockChain.skip).toHaveBeenCalledWith(0);
      expect(mockChain.limit).toHaveBeenCalledWith(2);
      expect(page1).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update a subscriber', async () => {
      const mockUpdated = {
        _id: 'mock-sub-id-1',
        name: 'John Updated',
        email: 'updated@example.com',
        phone: '+1234567890',
        organizationId: orgId,
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.update('mock-sub-id-1', {
        name: 'John Updated',
        email: 'updated@example.com',
      });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'mock-sub-id-1',
        { $set: { name: 'John Updated', email: 'updated@example.com' } },
        { new: true },
      );
      expect(updated).toBeDefined();
      expect(updated.name).toBe('John Updated');
      expect(updated.email).toBe('updated@example.com');
      expect(updated.phone).toBe('+1234567890');
      expect(updated.organizationId).toBe(orgId);
    });
  });

  describe('updatePreferences', () => {
    it("should update subscriber's channel preferences", async () => {
      const newPreferences = {
        [Channel.EMAIL]: { enabled: false },
        [Channel.WHATSAPP]: { enabled: true, providerId: 'twilio-wa' },
      };

      const mockPreferencesMap = new Map();
      mockPreferencesMap.set(Channel.EMAIL, { enabled: false });
      mockPreferencesMap.set(Channel.WHATSAPP, {
        enabled: true,
        providerId: 'twilio-wa',
      });

      const mockUpdated = {
        _id: 'mock-sub-id-1',
        channelPreferences: mockPreferencesMap,
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.updatePreferences(
        'mock-sub-id-1',
        newPreferences,
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'mock-sub-id-1',
        {
          $set: {
            [`channelPreferences.${Channel.EMAIL}`]: { enabled: false },
            [`channelPreferences.${Channel.WHATSAPP}`]: {
              enabled: true,
              providerId: 'twilio-wa',
            },
          },
        },
        { new: true },
      );
      expect(updated).toBeDefined();
      const prefs = updated.channelPreferences;
      expect(prefs.get(Channel.EMAIL)).toMatchObject({ enabled: false });
      expect(prefs.get(Channel.WHATSAPP)).toMatchObject({
        enabled: true,
        providerId: 'twilio-wa',
      });
    });
  });

  describe('remove', () => {
    it('should delete a subscriber', async () => {
      const mockDeleted = {
        _id: 'mock-sub-id-1',
        externalId: 'ext-user-001',
      };
      model.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDeleted),
      });

      const result = await service.remove('mock-sub-id-1');
      expect(result).toBeDefined();
    });
  });

  describe('findBySegment', () => {
    it('should find subscribers by segment filter (customAttributes matching)', async () => {
      const mockResults = [
        {
          _id: 's1',
          organizationId: orgId,
          externalId: 'ext-seg-001',
          customAttributes: { plan: 'premium', age: 30 },
        },
        {
          _id: 's3',
          organizationId: orgId,
          externalId: 'ext-seg-003',
          customAttributes: { plan: 'premium', age: 45 },
        },
      ];
      const mockExec = jest.fn().mockResolvedValueOnce(mockResults);
      model.find.mockReturnValueOnce({ exec: mockExec });

      const premiumUsers = await service.findBySegment(orgId, [
        { field: 'customAttributes.plan', operator: 'eq', value: 'premium' },
      ]);

      expect(model.find).toHaveBeenCalledWith({
        organizationId: orgId,
        'customAttributes.plan': 'premium',
      });
      expect(premiumUsers).toHaveLength(2);
      expect(
        premiumUsers.every((s) => s.organizationId === orgId),
      ).toBe(true);
      expect(
        premiumUsers.every(
          (s) => (s.customAttributes as Record<string, unknown>).plan === 'premium',
        ),
      ).toBe(true);
    });

    it('should support gt operator for segment filters', async () => {
      const mockResults = [
        { _id: 's1', organizationId: orgId, externalId: 'ext-gt-001', customAttributes: { age: 30 } },
        { _id: 's3', organizationId: orgId, externalId: 'ext-gt-003', customAttributes: { age: 45 } },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const olderThan25 = await service.findBySegment(orgId, [
        { field: 'customAttributes.age', operator: 'gt', value: 25 },
      ]);

      expect(model.find).toHaveBeenCalledWith({
        organizationId: orgId,
        'customAttributes.age': { $gt: 25 },
      });
      expect(olderThan25).toHaveLength(2);
    });

    it('should support lt operator for segment filters', async () => {
      const mockResults = [
        { _id: 's2', organizationId: orgId, externalId: 'ext-lt-002', customAttributes: { age: 18 } },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const youngerThan25 = await service.findBySegment(orgId, [
        { field: 'customAttributes.age', operator: 'lt', value: 25 },
      ]);

      expect(model.find).toHaveBeenCalledWith({
        organizationId: orgId,
        'customAttributes.age': { $lt: 25 },
      });
      expect(youngerThan25).toHaveLength(1);
      expect(youngerThan25[0].externalId).toBe('ext-lt-002');
    });

    it('should support contains operator for segment filters', async () => {
      const mockResults = [
        { _id: 's1', organizationId: orgId, externalId: 'ext-contains-001', tags: ['vip', 'beta'] },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const vipUsers = await service.findBySegment(orgId, [
        { field: 'tags', operator: 'contains', value: 'vip' },
      ]);

      expect(model.find).toHaveBeenCalledWith({
        organizationId: orgId,
        tags: 'vip',
      });
      expect(vipUsers).toHaveLength(1);
      expect(vipUsers[0].externalId).toBe('ext-contains-001');
    });
  });

  describe('customAttributes', () => {
    it('should add custom attributes to a subscriber', async () => {
      const mockCreated = {
        _id: 'mock-sub-custom-1',
        organizationId: orgId,
        externalId: 'ext-custom-001',
        customAttributes: {
          company: 'Acme Inc',
          role: 'admin',
          score: 95,
        },
      };
      model.create.mockResolvedValueOnce(mockCreated);

      const created = await service.create({
        organizationId: orgId,
        externalId: 'ext-custom-001',
        customAttributes: {
          company: 'Acme Inc',
          role: 'admin',
          score: 95,
        },
      });

      expect(created.customAttributes).toBeDefined();
      expect(created.customAttributes).toMatchObject({
        company: 'Acme Inc',
        role: 'admin',
        score: 95,
      });
    });
  });

  describe('pushTokens', () => {
    it('should update push tokens for a subscriber', async () => {
      const mockUpdated = {
        _id: 'mock-sub-push-1',
        pushTokens: ['token-new-1', 'token-new-2'],
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.update('mock-sub-push-1', {
        pushTokens: ['token-new-1', 'token-new-2'],
      });

      expect(updated.pushTokens).toEqual(['token-new-1', 'token-new-2']);
      expect(updated.pushTokens).toHaveLength(2);
    });
  });
});
