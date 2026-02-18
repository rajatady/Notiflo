import { Test, TestingModule } from '@nestjs/testing';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { Channel } from '../core';

describe('SubscribersController', () => {
  let controller: SubscribersController;
  let service: SubscribersService;

  const mockSubscriber = {
    _id: '507f1f77bcf86cd799439011',
    organizationId: 'org-test-123',
    externalId: 'ext-user-001',
    email: 'john@example.com',
    phone: '+1234567890',
    name: 'John Doe',
    locale: 'en',
    timezone: 'America/New_York',
    pushTokens: ['token-abc'],
    channelPreferences: new Map([
      [Channel.EMAIL, { enabled: true, providerId: 'sendgrid' }],
      [Channel.SMS, { enabled: false }],
    ]),
    customAttributes: { plan: 'premium' },
    tags: ['vip'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockSubscriber2 = {
    _id: '507f1f77bcf86cd799439022',
    organizationId: 'org-test-123',
    externalId: 'ext-user-002',
    email: 'jane@example.com',
    name: 'Jane Doe',
    locale: 'en',
  };

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByExternalId: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    updatePreferences: jest.fn(),
    findBySegment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        {
          provide: SubscribersService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<SubscribersController>(SubscribersController);
    service = module.get<SubscribersService>(SubscribersService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST / - create', () => {
    it('should create a subscriber', async () => {
      const createDto = {
        organizationId: 'org-test-123',
        externalId: 'ext-user-001',
        email: 'john@example.com',
        name: 'John Doe',
      };
      mockService.create.mockResolvedValue(mockSubscriber);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockSubscriber);
      expect(mockService.create).toHaveBeenCalledWith(createDto);
      expect(mockService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET / - findAll', () => {
    it('should list subscribers with organizationId query param', async () => {
      mockService.findAll.mockResolvedValue([
        mockSubscriber,
        mockSubscriber2,
      ]);

      const result = await controller.findAll('org-test-123', 10, 0);

      expect(result).toHaveLength(2);
      expect(mockService.findAll).toHaveBeenCalledWith(
        'org-test-123',
        10,
        0,
      );
    });

    it('should pass default limit and offset when not provided', async () => {
      mockService.findAll.mockResolvedValue([mockSubscriber]);

      const result = await controller.findAll('org-test-123');

      expect(result).toHaveLength(1);
      expect(mockService.findAll).toHaveBeenCalledWith(
        'org-test-123',
        undefined,
        undefined,
      );
    });
  });

  describe('GET /:id - findOne', () => {
    it('should get subscriber by id', async () => {
      mockService.findOne.mockResolvedValue(mockSubscriber);

      const result = await controller.findOne('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockSubscriber);
      expect(mockService.findOne).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });
  });

  describe('GET /external/:externalId - findByExternalId', () => {
    it('should get subscriber by external ID', async () => {
      mockService.findByExternalId.mockResolvedValue(mockSubscriber);

      const result = await controller.findByExternalId(
        'ext-user-001',
        'org-test-123',
      );

      expect(result).toEqual(mockSubscriber);
      expect(mockService.findByExternalId).toHaveBeenCalledWith(
        'org-test-123',
        'ext-user-001',
      );
    });
  });

  describe('PATCH /:id - update', () => {
    it('should update subscriber', async () => {
      const updateDto = { name: 'John Updated', email: 'new@example.com' };
      const updatedSubscriber = { ...mockSubscriber, ...updateDto };
      mockService.update.mockResolvedValue(updatedSubscriber);

      const result = await controller.update(
        '507f1f77bcf86cd799439011',
        updateDto,
      );

      expect(result.name).toBe('John Updated');
      expect(result.email).toBe('new@example.com');
      expect(mockService.update).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        updateDto,
      );
    });
  });

  describe('DELETE /:id - remove', () => {
    it('should remove subscriber', async () => {
      mockService.remove.mockResolvedValue(mockSubscriber);

      const result = await controller.remove('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockSubscriber);
      expect(mockService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });
  });

  describe('PATCH /:id/preferences - updatePreferences', () => {
    it('should update channel preferences', async () => {
      const preferences = {
        [Channel.EMAIL]: { enabled: false },
        [Channel.WHATSAPP]: { enabled: true, providerId: 'twilio-wa' },
      };
      const updatedSubscriber = {
        ...mockSubscriber,
        channelPreferences: new Map([
          [Channel.EMAIL, { enabled: false }],
          [Channel.WHATSAPP, { enabled: true, providerId: 'twilio-wa' }],
        ]),
      };
      mockService.updatePreferences.mockResolvedValue(updatedSubscriber);

      const result = await controller.updatePreferences(
        '507f1f77bcf86cd799439011',
        preferences,
      );

      expect(result).toEqual(updatedSubscriber);
      expect(mockService.updatePreferences).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        preferences,
      );
    });
  });

  describe('POST /segment - findBySegment', () => {
    it('should query subscribers by segment', async () => {
      const segmentBody = {
        organizationId: 'org-test-123',
        filters: [
          {
            field: 'customAttributes.plan',
            operator: 'eq' as const,
            value: 'premium',
          },
        ],
      };
      mockService.findBySegment.mockResolvedValue([mockSubscriber]);

      const result = await controller.findBySegment(segmentBody);

      expect(result).toHaveLength(1);
      expect(mockService.findBySegment).toHaveBeenCalledWith(
        'org-test-123',
        segmentBody.filters,
      );
    });
  });
});
