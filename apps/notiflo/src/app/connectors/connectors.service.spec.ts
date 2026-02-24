import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConnectorsService } from './connectors.service';
import { Connector, ConnectorDocument } from './schemas/connector.schema';

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  let connectorModel: Model<ConnectorDocument>;

  const mockDoc = (overrides: Partial<any> = {}) => ({
    _id: { toString: () => 'conn-id-1' },
    organizationId: 'org-1',
    name: 'My Redis Stream',
    type: 'redis_stream',
    config: { url: 'redis://localhost:6379', streamKey: 'ticks', consumerGroup: 'notiflo' },
    active: true,
    status: 'disconnected',
    ticksIngested: 0,
    ...overrides,
  });

  beforeEach(async () => {
    const mockConnectorModel: any = {
      create: jest.fn(),
      find: jest.fn().mockReturnThis(),
      findById: jest.fn().mockReturnThis(),
      findByIdAndUpdate: jest.fn().mockReturnThis(),
      findByIdAndDelete: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorsService,
        {
          provide: getModelToken(Connector.name),
          useValue: mockConnectorModel,
        },
      ],
    }).compile();

    service = module.get<ConnectorsService>(ConnectorsService);
    connectorModel = module.get<Model<ConnectorDocument>>(
      getModelToken(Connector.name),
    );
  });

  describe('create', () => {
    it('should save a connector to MongoDB', async () => {
      const doc = mockDoc();
      (connectorModel.create as jest.Mock).mockResolvedValue(doc);

      const result = await service.create({
        organizationId: 'org-1',
        name: 'My Redis Stream',
        type: 'redis_stream',
        config: { url: 'redis://localhost:6379', streamKey: 'ticks', consumerGroup: 'notiflo' },
      });

      expect(connectorModel.create).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'My Redis Stream',
        type: 'redis_stream',
        config: { url: 'redis://localhost:6379', streamKey: 'ticks', consumerGroup: 'notiflo' },
      });
      expect(result).toEqual(doc);
    });
  });

  describe('findAll', () => {
    it('should return connectors for an organization', async () => {
      const docs = [mockDoc(), mockDoc({ _id: { toString: () => 'conn-id-2' }, name: 'Kafka' })];
      (connectorModel.find as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(docs),
      });

      const result = await service.findAll('org-1');

      expect(connectorModel.find).toHaveBeenCalledWith({ organizationId: 'org-1' });
      expect(result).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return a single connector by id', async () => {
      const doc = mockDoc();
      (connectorModel.findById as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      const result = await service.findOne('conn-id-1');

      expect(connectorModel.findById).toHaveBeenCalledWith('conn-id-1');
      expect(result).toEqual(doc);
    });

    it('should return null when not found', async () => {
      (connectorModel.findById as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(null),
      });

      const result = await service.findOne('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return the updated connector', async () => {
      const doc = mockDoc({ name: 'Updated Name' });
      (connectorModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      const result = await service.update('conn-id-1', { name: 'Updated Name' });

      expect(connectorModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'conn-id-1',
        { name: 'Updated Name' },
        { new: true },
      );
      expect(result).toEqual(doc);
    });
  });

  describe('remove', () => {
    it('should delete and return the deleted connector', async () => {
      const doc = mockDoc();
      (connectorModel.findByIdAndDelete as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      const result = await service.remove('conn-id-1');

      expect(connectorModel.findByIdAndDelete).toHaveBeenCalledWith('conn-id-1');
      expect(result).toEqual(doc);
    });
  });
});
