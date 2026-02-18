import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { Channel } from '../core';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;

  const mockTemplate = {
    _id: '64b0a1e77f1d2c001f8e4a01',
    organizationId: 'org-123',
    name: 'Welcome Email',
    description: 'Sent when a user signs up',
    channels: {
      [Channel.EMAIL]: {
        subject: 'Welcome {{name}}',
        body: '<h1>Hello {{name}}</h1>',
      },
    },
    variables: [
      { name: 'name', type: 'string', required: true },
    ],
    tags: ['onboarding'],
    active: true,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockTemplatesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByTag: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST / (create)', () => {
    it('should create a template via POST', async () => {
      const createDto: CreateTemplateDto = {
        organizationId: 'org-123',
        name: 'Welcome Email',
        description: 'Sent when a user signs up',
        channels: {
          [Channel.EMAIL]: {
            subject: 'Welcome {{name}}',
            body: '<h1>Hello {{name}}</h1>',
          },
        },
        variables: [
          { name: 'name', type: 'string', required: true },
        ],
        tags: ['onboarding'],
      };

      mockTemplatesService.create.mockResolvedValue(mockTemplate);

      const result = await controller.create(createDto);

      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(mockTemplate);
      expect(result.name).toBe('Welcome Email');
      expect(result.organizationId).toBe('org-123');
    });
  });

  describe('GET / (findAll)', () => {
    it('should get all templates via GET', async () => {
      const templates = [mockTemplate, { ...mockTemplate, name: 'Another' }];
      mockTemplatesService.findAll.mockResolvedValue(templates);

      const result = await controller.findAll('org-123');

      expect(service.findAll).toHaveBeenCalledWith('org-123');
      expect(result).toHaveLength(2);
    });
  });

  describe('GET /:id (findOne)', () => {
    it('should get a template by ID via GET :id', async () => {
      mockTemplatesService.findOne.mockResolvedValue(mockTemplate);

      const result = await controller.findOne('64b0a1e77f1d2c001f8e4a01');

      expect(service.findOne).toHaveBeenCalledWith('64b0a1e77f1d2c001f8e4a01');
      expect(result).toEqual(mockTemplate);
      expect(result.name).toBe('Welcome Email');
    });
  });

  describe('PATCH /:id (update)', () => {
    it('should update a template via PATCH :id', async () => {
      const updateDto: UpdateTemplateDto = {
        name: 'Updated Welcome Email',
      };
      const updatedTemplate = {
        ...mockTemplate,
        name: 'Updated Welcome Email',
        version: 2,
      };
      mockTemplatesService.update.mockResolvedValue(updatedTemplate);

      const result = await controller.update(
        '64b0a1e77f1d2c001f8e4a01',
        updateDto,
      );

      expect(service.update).toHaveBeenCalledWith(
        '64b0a1e77f1d2c001f8e4a01',
        updateDto,
      );
      expect(result.name).toBe('Updated Welcome Email');
      expect(result.version).toBe(2);
    });
  });

  describe('DELETE /:id (remove)', () => {
    it('should delete a template via DELETE :id', async () => {
      mockTemplatesService.remove.mockResolvedValue(mockTemplate);

      const result = await controller.remove('64b0a1e77f1d2c001f8e4a01');

      expect(service.remove).toHaveBeenCalledWith('64b0a1e77f1d2c001f8e4a01');
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('GET /tag/:tag (findByTag)', () => {
    it('should find templates by tag', async () => {
      const templates = [mockTemplate];
      mockTemplatesService.findByTag.mockResolvedValue(templates);

      const result = await controller.findByTag('onboarding', 'org-123');

      expect(service.findByTag).toHaveBeenCalledWith('org-123', 'onboarding');
      expect(result).toHaveLength(1);
      expect(result[0].tags).toContain('onboarding');
    });
  });
});
