import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlertsService } from './alerts.service';
import { AlertCondition, AlertConditionDocument } from './schemas/alert-condition.schema';
import { ENGINE_BRIDGE, IEngineBridge } from '@notiflo/bridge/napi-bridge';

describe('AlertsService', () => {
  let service: AlertsService;
  let alertModel: Model<AlertConditionDocument>;
  let mockEngineBridge: jest.Mocked<IEngineBridge>;

  const mockDoc = (overrides: Partial<any> = {}) => ({
    _id: { toString: () => 'doc-id-1' },
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    symbol: 'AAPL',
    strategyType: 'threshold_crossing',
    strategyParams: { threshold: 150, operator: 'cross_above' },
    channels: ['email'],
    active: true,
    triggerCount: 0,
    ...overrides,
  });

  beforeEach(async () => {
    mockEngineBridge = {
      isInitialized: jest.fn().mockReturnValue(true),
      addCondition: jest.fn().mockReturnValue('doc-id-1'),
      removeCondition: jest.fn().mockReturnValue(true),
      updateCondition: jest.fn().mockReturnValue(true),
      bulkLoadConditions: jest.fn().mockReturnValue(2),
      getConditionCount: jest.fn().mockReturnValue(5),
      evaluateTick: jest.fn().mockReturnValue([]),
      getMetrics: jest.fn().mockReturnValue({
        totalConditions: 5,
        totalTicksProcessed: 0,
        totalMatches: 0,
        ticksPerSecond: 0,
        matchesPerSecond: 0,
        avgEvaluationUs: 0,
        strategies: [],
      }),
    };

    const mockAlertModel: any = {
      create: jest.fn(),
      find: jest.fn().mockReturnThis(),
      findById: jest.fn().mockReturnThis(),
      findByIdAndUpdate: jest.fn().mockReturnThis(),
      findByIdAndDelete: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getModelToken(AlertCondition.name),
          useValue: mockAlertModel,
        },
        {
          provide: ENGINE_BRIDGE,
          useValue: mockEngineBridge,
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
    alertModel = module.get<Model<AlertConditionDocument>>(
      getModelToken(AlertCondition.name),
    );
  });

  describe('onModuleInit', () => {
    it('should bulk load active conditions from MongoDB', async () => {
      const docs = [mockDoc(), mockDoc({ _id: { toString: () => 'doc-id-2' } })];
      (alertModel.find as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(docs) }),
      });

      await service.onModuleInit();

      expect(mockEngineBridge.bulkLoadConditions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'doc-id-1' }),
          expect.objectContaining({ id: 'doc-id-2' }),
        ]),
      );
    });

    it('should skip bulk load when engine not initialized', async () => {
      mockEngineBridge.isInitialized.mockReturnValue(false);

      await service.onModuleInit();

      expect(mockEngineBridge.bulkLoadConditions).not.toHaveBeenCalled();
    });

    it('should handle no active conditions', async () => {
      (alertModel.find as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve([]) }),
      });

      await service.onModuleInit();

      expect(mockEngineBridge.bulkLoadConditions).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should save to MongoDB AND call engineBridge.addCondition', async () => {
      const doc = mockDoc();
      (alertModel.create as jest.Mock).mockResolvedValue(doc);

      await service.create({
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 150, operator: 'cross_above' },
        channels: ['email'],
      } as any);

      expect(alertModel.create).toHaveBeenCalled();
      expect(mockEngineBridge.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'doc-id-1',
          symbol: 'AAPL',
          strategyType: 'threshold_crossing',
        }),
      );
    });

    it('should NOT call engine when active is false', async () => {
      const doc = mockDoc({ active: false });
      (alertModel.create as jest.Mock).mockResolvedValue(doc);

      await service.create({
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 150, operator: 'cross_above' },
        channels: ['email'],
        active: false,
      } as any);

      expect(mockEngineBridge.addCondition).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete from MongoDB AND call engineBridge.removeCondition', async () => {
      const doc = mockDoc();
      (alertModel.findByIdAndDelete as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      await service.remove('doc-id-1');

      expect(mockEngineBridge.removeCondition).toHaveBeenCalledWith('doc-id-1');
    });
  });

  describe('toggleActive', () => {
    it('should add to engine when toggled active', async () => {
      const doc = mockDoc({ active: true });
      (alertModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      await service.toggleActive('doc-id-1', true);

      expect(mockEngineBridge.addCondition).toHaveBeenCalled();
    });

    it('should remove from engine when toggled inactive', async () => {
      const doc = mockDoc({ active: false });
      (alertModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(doc),
      });

      await service.toggleActive('doc-id-1', false);

      expect(mockEngineBridge.removeCondition).toHaveBeenCalledWith('doc-id-1');
    });
  });

  describe('evaluateTick', () => {
    it('should delegate to engineBridge', () => {
      const tick = { symbol: 'AAPL', value: 160, timestampUs: 1000 };
      const expectedMatches = [
        {
          conditionId: 'c1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email'],
          timestampUs: 1000,
        },
      ];
      mockEngineBridge.evaluateTick.mockReturnValue(expectedMatches);

      const result = service.evaluateTick(tick);

      expect(result).toEqual(expectedMatches);
      expect(mockEngineBridge.evaluateTick).toHaveBeenCalledWith(tick);
    });

    it('should throw when engine not initialized', () => {
      mockEngineBridge.isInitialized.mockReturnValue(false);

      expect(() =>
        service.evaluateTick({ symbol: 'AAPL', value: 160, timestampUs: 1000 }),
      ).toThrow('Engine not initialized');
    });
  });

  describe('recordTrigger', () => {
    it('should increment triggerCount and set lastTriggeredAt', async () => {
      (alertModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
        exec: () => Promise.resolve(null),
      });

      await service.recordTrigger('cond-1');

      expect(alertModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'cond-1',
        expect.objectContaining({
          $inc: { triggerCount: 1 },
          $set: expect.objectContaining({ lastTriggeredAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('getEngineMetrics', () => {
    it('should return engine metrics when initialized', () => {
      const metrics = service.getEngineMetrics();
      expect(metrics).toEqual(
        expect.objectContaining({ totalConditions: 5 }),
      );
    });

    it('should return { available: false } when engine not initialized', () => {
      mockEngineBridge.isInitialized.mockReturnValue(false);
      expect(service.getEngineMetrics()).toEqual({ available: false });
    });
  });

  describe('when engine bridge is null (not provided)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AlertsService,
          {
            provide: getModelToken(AlertCondition.name),
            useValue: {
              create: jest.fn().mockResolvedValue(mockDoc()),
              find: jest.fn().mockReturnThis(),
              findById: jest.fn().mockReturnThis(),
              findByIdAndUpdate: jest.fn().mockReturnThis(),
              findByIdAndDelete: jest.fn().mockReturnThis(),
              lean: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            },
          },
          // No ENGINE_BRIDGE provided — tests graceful degradation
        ],
      }).compile();

      service = module.get<AlertsService>(AlertsService);
    });

    it('should not throw during onModuleInit', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should create alert without engine sync', async () => {
      const result = await service.create({
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 150, operator: 'cross_above' },
        channels: ['email'],
      } as any);

      expect(result).toBeDefined();
    });

    it('should report engine unavailable', () => {
      expect(service.isEngineAvailable()).toBe(false);
      expect(service.getEngineConditionCount()).toBe(0);
    });
  });
});
