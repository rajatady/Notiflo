import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventsService } from './events.service';
import { EVENT_BUS, EventSource } from '../core';

describe('EventsService', () => {
  let service: EventsService;
  let eventModel: any;
  let eventBus: any;

  beforeEach(async () => {
    eventModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    };

    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      subscribeAll: jest.fn(),
      unsubscribe: jest.fn(),
      clearAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getModelToken('NotifloEvent'),
          useValue: eventModel,
        },
        {
          provide: EVENT_BUS,
          useValue: eventBus,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('ingest', () => {
    it('should ingest and store an event', async () => {
      const mockEventDoc = {
        _id: 'event-id-1',
        organizationId: 'org-1',
        name: 'user.signup',
        payload: { email: 'test@example.com' },
        source: EventSource.API,
        processed: false,
        createdAt: new Date(),
        toString: () => 'event-id-1',
      };
      // Make _id.toString() work
      mockEventDoc._id = { toString: () => 'event-id-1' } as any;

      eventModel.create.mockResolvedValueOnce(mockEventDoc);

      const result = await service.ingest({
        organizationId: 'org-1',
        name: 'user.signup',
        payload: { email: 'test@example.com' },
        source: EventSource.API,
      });

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-1');
      expect(result.name).toBe('user.signup');
      expect(result.payload).toEqual({ email: 'test@example.com' });
      expect(result.source).toBe(EventSource.API);
      expect(result.processed).toBe(false);
      expect(eventModel.create).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'user.signup',
        subscriberId: undefined,
        payload: { email: 'test@example.com' },
        source: EventSource.API,
        processed: false,
      });
    });

    it('should publish event to event bus when ingesting', async () => {
      const mockEventDoc = {
        _id: { toString: () => 'event-id-2' },
        organizationId: 'org-1',
        name: 'user.signup',
        subscriberId: undefined,
        payload: { email: 'test@example.com' },
        source: EventSource.API,
        processed: false,
        createdAt: new Date(),
      };
      eventModel.create.mockResolvedValueOnce(mockEventDoc);

      await service.ingest({
        organizationId: 'org-1',
        name: 'user.signup',
        payload: { email: 'test@example.com' },
      });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = eventBus.publish.mock.calls[0][0];
      expect(publishedEvent.name).toBe('user.signup');
      expect(publishedEvent.organizationId).toBe('org-1');
      expect(publishedEvent.id).toBeDefined();
    });

    it('should default source to API if not provided', async () => {
      const mockEventDoc = {
        _id: { toString: () => 'event-id-3' },
        organizationId: 'org-1',
        name: 'user.signup',
        payload: {},
        source: EventSource.API,
        processed: false,
        createdAt: new Date(),
      };
      eventModel.create.mockResolvedValueOnce(mockEventDoc);

      const result = await service.ingest({
        organizationId: 'org-1',
        name: 'user.signup',
        payload: {},
      });

      expect(result.source).toBe(EventSource.API);
      expect(eventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: EventSource.API }),
      );
    });
  });

  describe('findAll', () => {
    it('should find events by organization', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', name: 'user.signup' },
        { _id: 'e2', organizationId: 'org-1', name: 'user.login' },
        { _id: 'e3', organizationId: 'org-1', name: 'order.created' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({ organizationId: 'org-1' });

      expect(events).toHaveLength(3);
      events.forEach((e) => expect(e.organizationId).toBe('org-1'));
    });

    it('should find events by name', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', name: 'user.signup' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({
        organizationId: 'org-1',
        name: 'user.signup',
      });

      expect(eventModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          name: 'user.signup',
        }),
      );
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('user.signup');
    });

    it('should find events by subscriber', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', subscriberId: 'sub-1' },
        { _id: 'e2', organizationId: 'org-1', subscriberId: 'sub-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({
        organizationId: 'org-1',
        subscriberId: 'sub-1',
      });

      expect(eventModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ subscriberId: 'sub-1' }),
      );
      expect(events).toHaveLength(2);
      events.forEach((e) => expect(e.subscriberId).toBe('sub-1'));
    });

    it('should find events by date range', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 60000);
      const futureDate = new Date(now.getTime() + 60000);

      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1' },
        { _id: 'e2', organizationId: 'org-1' },
        { _id: 'e3', organizationId: 'org-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({
        organizationId: 'org-1',
        from: pastDate,
        to: futureDate,
      });

      expect(eventModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: { $gte: pastDate, $lte: futureDate },
        }),
      );
      expect(events).toHaveLength(3);
    });

    it('should return empty for future date range', async () => {
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([]),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({
        organizationId: 'org-1',
        from: new Date(Date.now() + 3600000),
        to: new Date(Date.now() + 7200000),
      });
      expect(events).toHaveLength(0);
    });

    it('should paginate events with limit/offset', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1' },
        { _id: 'e2', organizationId: 'org-1' },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const page1 = await service.findAll({
        organizationId: 'org-1',
        limit: 2,
        offset: 0,
      });

      expect(mockChain.skip).toHaveBeenCalledWith(0);
      expect(mockChain.limit).toHaveBeenCalledWith(2);
      expect(page1).toHaveLength(2);
    });

    it('should filter by source', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', source: EventSource.API },
        { _id: 'e2', organizationId: 'org-1', source: EventSource.API },
      ];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(mockEvents),
      };
      eventModel.find.mockReturnValueOnce(mockChain);

      const events = await service.findAll({
        organizationId: 'org-1',
        source: EventSource.API,
      });

      expect(eventModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ source: EventSource.API }),
      );
      expect(events).toHaveLength(2);
      events.forEach((e) => expect(e.source).toBe(EventSource.API));
    });
  });

  describe('findOne', () => {
    it('should find a single event by id', async () => {
      const mockEvent = {
        _id: 'event-id-1',
        name: 'user.signup',
        organizationId: 'org-1',
      };
      eventModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockEvent),
      });

      const found = await service.findOne('event-id-1');

      expect(found).toBeDefined();
      expect(found.name).toBe('user.signup');
      expect(found.organizationId).toBe('org-1');
    });

    it('should return null for non-existent id', async () => {
      eventModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      const found = await service.findOne('507f1f77bcf86cd799439011');
      expect(found).toBeNull();
    });
  });

  describe('markProcessed', () => {
    it('should mark event as processed', async () => {
      const mockUpdated = {
        _id: 'event-id-1',
        processed: true,
      };
      eventModel.findByIdAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(mockUpdated),
      });

      const updated = await service.markProcessed('event-id-1');

      expect(eventModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'event-id-1',
        { processed: true },
        { new: true },
      );
      expect(updated.processed).toBe(true);
    });
  });
});
