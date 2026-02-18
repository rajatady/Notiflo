import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventSource } from '../core';
import { NotFoundException } from '@nestjs/common';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: any;

  beforeEach(async () => {
    eventsService = {
      ingest: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: eventsService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('POST /events', () => {
    it('should ingest an event and return it', async () => {
      const mockResult = {
        _id: 'event-id-1',
        organizationId: 'org-1',
        name: 'user.signup',
        payload: { email: 'test@example.com' },
        source: EventSource.API,
        processed: false,
      };
      eventsService.ingest.mockResolvedValueOnce(mockResult);

      const result = await controller.ingest({
        organizationId: 'org-1',
        name: 'user.signup',
        payload: { email: 'test@example.com' },
        source: EventSource.API,
      });

      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-1');
      expect(result.name).toBe('user.signup');
      expect(result.payload).toEqual({ email: 'test@example.com' });
      expect(result.processed).toBe(false);
    });

    it('should ingest an event with optional subscriberId', async () => {
      const mockResult = {
        _id: 'event-id-2',
        organizationId: 'org-1',
        name: 'user.signup',
        subscriberId: 'sub-1',
        payload: { email: 'test@example.com' },
      };
      eventsService.ingest.mockResolvedValueOnce(mockResult);

      const result = await controller.ingest({
        organizationId: 'org-1',
        name: 'user.signup',
        subscriberId: 'sub-1',
        payload: { email: 'test@example.com' },
      });

      expect(result.subscriberId).toBe('sub-1');
    });
  });

  describe('GET /events', () => {
    it('should list events filtered by organizationId', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', name: 'user.signup' },
        { _id: 'e2', organizationId: 'org-1', name: 'order.created' },
      ];
      eventsService.findAll.mockResolvedValueOnce(mockEvents);

      const result = await controller.findAll('org-1');

      expect(result).toHaveLength(2);
      result.forEach((e: any) => expect(e.organizationId).toBe('org-1'));
    });

    it('should list events filtered by name', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1', name: 'user.signup' },
      ];
      eventsService.findAll.mockResolvedValueOnce(mockEvents);

      const result = await controller.findAll('org-1', 'user.signup');

      expect(eventsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          name: 'user.signup',
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user.signup');
    });

    it('should support pagination via limit and offset', async () => {
      const mockEvents = [
        { _id: 'e1', organizationId: 'org-1' },
      ];
      eventsService.findAll.mockResolvedValueOnce(mockEvents);

      const result = await controller.findAll(
        'org-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1',
        '0',
      );

      expect(eventsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 1,
          offset: 0,
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /events/:id', () => {
    it('should get a single event by id', async () => {
      const mockEvent = {
        _id: 'event-id-1',
        name: 'user.signup',
        organizationId: 'org-1',
      };
      eventsService.findOne.mockResolvedValueOnce(mockEvent);

      const result = await controller.findOne('event-id-1');

      expect(result.name).toBe('user.signup');
      expect(result.organizationId).toBe('org-1');
    });

    it('should throw NotFoundException for non-existent event', async () => {
      eventsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
