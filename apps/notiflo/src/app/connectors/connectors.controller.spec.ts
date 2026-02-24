import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

describe('ConnectorsController', () => {
  let controller: ConnectorsController;
  let mockConnectorsService: any;

  beforeEach(async () => {
    mockConnectorsService = {
      create: jest.fn().mockResolvedValue({ _id: 'conn-1', name: 'My Redis Stream' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorsController],
      providers: [
        { provide: ConnectorsService, useValue: mockConnectorsService },
      ],
    }).compile();

    controller = module.get<ConnectorsController>(ConnectorsController);
  });

  describe('POST /connectors', () => {
    it('should create a connector and return document', async () => {
      const dto = {
        organizationId: 'org-1',
        name: 'My Redis Stream',
        type: 'redis_stream',
        config: { url: 'redis://localhost:6379', streamKey: 'ticks', consumerGroup: 'notiflo' },
      };

      const result = await controller.create(dto as any);
      expect(result).toEqual(expect.objectContaining({ _id: 'conn-1' }));
      expect(mockConnectorsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('GET /connectors', () => {
    it('should return connectors for an organization', async () => {
      mockConnectorsService.findAll.mockResolvedValue([
        { _id: 'conn-1', name: 'Redis Stream' },
        { _id: 'conn-2', name: 'Kafka' },
      ]);

      const result = await controller.findAll('org-1');
      expect(result).toHaveLength(2);
      expect(mockConnectorsService.findAll).toHaveBeenCalledWith('org-1');
    });
  });

  describe('GET /connectors/:id', () => {
    it('should return a single connector', async () => {
      mockConnectorsService.findOne.mockResolvedValue({ _id: 'conn-1' });
      const result = await controller.findOne('conn-1');
      expect(result).toEqual({ _id: 'conn-1' });
    });
  });

  describe('PATCH /connectors/:id', () => {
    it('should update a connector', async () => {
      mockConnectorsService.update.mockResolvedValue({ _id: 'conn-1', name: 'Updated' });
      const result = await controller.update('conn-1', { name: 'Updated' });
      expect(result).toEqual({ _id: 'conn-1', name: 'Updated' });
      expect(mockConnectorsService.update).toHaveBeenCalledWith('conn-1', { name: 'Updated' });
    });
  });

  describe('DELETE /connectors/:id', () => {
    it('should delete a connector', async () => {
      mockConnectorsService.remove.mockResolvedValue({ _id: 'conn-1' });
      const result = await controller.remove('conn-1');
      expect(result).toEqual({ _id: 'conn-1' });
    });
  });
});
