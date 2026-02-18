import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TemplatesService } from './templates.service';
import { NotifloTemplate } from './schemas/template.schema';
import { Channel } from '../core';
import { CreateTemplateDto } from './dto/create-template.dto';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let model: any;

  const createDto: CreateTemplateDto = {
    organizationId: 'org-123',
    name: 'Welcome Email',
    description: 'Sent when a user signs up',
    channels: {
      [Channel.EMAIL]: {
        subject: 'Welcome {{name}}',
        body: '<h1>Hello {{name}}</h1>',
      },
      [Channel.SMS]: {
        body: 'Welcome {{name}}! Your code is {{code}}.',
      },
    },
    variables: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'User name',
      },
      {
        name: 'code',
        type: 'string',
        required: false,
        defaultValue: '0000',
      },
    ],
    tags: ['onboarding', 'welcome'],
  };

  beforeEach(async () => {
    model = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: getModelToken(NotifloTemplate.name),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a template', async () => {
      const mockResult = {
        _id: 'mock-id-1',
        ...createDto,
        version: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      model.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(createDto);

      expect(model.create).toHaveBeenCalledWith({
        ...createDto,
        version: 1,
        active: true,
      });
      expect(result).toBeDefined();
      expect(result.name).toBe('Welcome Email');
      expect(result.organizationId).toBe('org-123');
      expect(result.description).toBe('Sent when a user signs up');
      expect(result.version).toBe(1);
      expect(result.active).toBe(true);
      expect(result.tags).toEqual(['onboarding', 'welcome']);
      expect(result.variables).toHaveLength(2);
      expect(result.variables[0].name).toBe('name');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create a template with default version 1 and active true', async () => {
      const minimalDto: CreateTemplateDto = {
        organizationId: 'org-456',
        name: 'Minimal Template',
        channels: {
          [Channel.SMS]: { body: 'Hello' },
        },
      };

      const mockResult = {
        _id: 'mock-id-2',
        ...minimalDto,
        version: 1,
        active: true,
      };
      model.create.mockResolvedValueOnce(mockResult);

      const result = await service.create(minimalDto);

      expect(model.create).toHaveBeenCalledWith({
        ...minimalDto,
        version: 1,
        active: true,
      });
      expect(result.version).toBe(1);
      expect(result.active).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should find a template by id', async () => {
      const mockTemplate = {
        _id: 'template-id-1',
        name: 'Welcome Email',
        organizationId: 'org-123',
      };
      model.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockTemplate),
      });

      const found = await service.findOne('template-id-1');

      expect(model.findById).toHaveBeenCalledWith('template-id-1');
      expect(found).toBeDefined();
      expect(found.name).toBe('Welcome Email');
      expect(found.organizationId).toBe('org-123');
    });

    it('should return null for non-existent id', async () => {
      model.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findOne('64b0a1e77f1d2c001f8e4a00');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all templates for an organization', async () => {
      const mockTemplates = [
        { _id: 't1', name: 'Welcome Email', organizationId: 'org-123' },
        { _id: 't2', name: 'Another Template', organizationId: 'org-123' },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockTemplates),
      });

      const results = await service.findAll('org-123');

      expect(model.find).toHaveBeenCalledWith({ organizationId: 'org-123' });
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.organizationId === 'org-123')).toBe(true);
    });

    it('should not find templates from other organizations', async () => {
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce([]),
      });

      const results = await service.findAll('org-nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update a template and increment version', async () => {
      const mockUpdated = {
        _id: 'template-id-1',
        name: 'Updated Welcome Email',
        description: 'Updated description',
        version: 2,
        organizationId: 'org-123',
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.update('template-id-1', {
        name: 'Updated Welcome Email',
        description: 'Updated description',
      });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'template-id-1',
        {
          name: 'Updated Welcome Email',
          description: 'Updated description',
          $inc: { version: 1 },
        },
        { new: true },
      );
      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Welcome Email');
      expect(updated.description).toBe('Updated description');
      expect(updated.version).toBe(2);
    });

    it('should return null for non-existent id', async () => {
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.update('64b0a1e77f1d2c001f8e4a00', {
        name: 'Does Not Exist',
      });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should delete a template', async () => {
      const mockDeleted = {
        _id: 'template-id-1',
        name: 'Welcome Email',
      };
      model.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDeleted),
      });

      const deleted = await service.remove('template-id-1');
      expect(deleted).toBeDefined();
      expect(deleted.name).toBe('Welcome Email');
    });

    it('should return null for non-existent id', async () => {
      model.findByIdAndDelete.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.remove('64b0a1e77f1d2c001f8e4a00');
      expect(result).toBeNull();
    });
  });

  describe('findByTag', () => {
    it('should find templates by tag', async () => {
      const mockResults = [
        { _id: 't1', name: 'Welcome Email', organizationId: 'org-123', tags: ['onboarding', 'welcome'] },
        { _id: 't2', name: 'Another Onboarding', organizationId: 'org-123', tags: ['onboarding'] },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const results = await service.findByTag('org-123', 'onboarding');

      expect(model.find).toHaveBeenCalledWith({ organizationId: 'org-123', tags: 'onboarding' });
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.tags.includes('onboarding'))).toBe(true);
    });

    it('should only find templates for the correct organization', async () => {
      const mockResults = [
        { _id: 't1', name: 'Welcome Email', organizationId: 'org-123', tags: ['onboarding'] },
      ];
      model.find.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockResults),
      });

      const results = await service.findByTag('org-123', 'onboarding');

      expect(results).toHaveLength(1);
      expect(results[0].organizationId).toBe('org-123');
    });
  });

  describe('activate/deactivate', () => {
    it('should deactivate a template', async () => {
      const mockDeactivated = {
        _id: 'template-id-1',
        active: false,
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockDeactivated),
      });

      const deactivated = await service.deactivate('template-id-1');

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'template-id-1',
        { active: false },
        { new: true },
      );
      expect(deactivated).toBeDefined();
      expect(deactivated.active).toBe(false);
    });

    it('should activate a deactivated template', async () => {
      const mockActivated = {
        _id: 'template-id-1',
        active: true,
      };
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockActivated),
      });

      const activated = await service.activate('template-id-1');

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'template-id-1',
        { active: true },
        { new: true },
      );
      expect(activated).toBeDefined();
      expect(activated.active).toBe(true);
    });

    it('should return null when activating non-existent template', async () => {
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.activate('64b0a1e77f1d2c001f8e4a00');
      expect(result).toBeNull();
    });

    it('should return null when deactivating non-existent template', async () => {
      model.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const result = await service.deactivate('64b0a1e77f1d2c001f8e4a00');
      expect(result).toBeNull();
    });
  });
});
