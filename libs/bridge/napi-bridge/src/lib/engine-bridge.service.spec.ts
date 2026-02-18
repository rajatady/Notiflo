import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EngineBridgeService } from './engine-bridge.service';

// Mock the native addon
const mockAddon = {
  initEngine: jest.fn(),
  addCondition: jest.fn().mockReturnValue('cond-1'),
  removeCondition: jest.fn().mockReturnValue(true),
  updateCondition: jest.fn().mockReturnValue(true),
  bulkLoadConditions: jest.fn().mockReturnValue(3),
  getConditionCount: jest.fn().mockReturnValue(5),
  evaluateTick: jest.fn().mockReturnValue([]),
  onConditionMatch: jest.fn(),
  getEngineMetrics: jest.fn().mockReturnValue({
    totalConditions: 5,
    totalTicksProcessed: 100,
    totalMatches: 10,
    ticksPerSecond: 50,
    matchesPerSecond: 5,
    avgEvaluationUs: 1.5,
    strategies: [],
  }),
};

jest.mock('engine-core', () => mockAddon, { virtual: true });

describe('EngineBridgeService', () => {
  let service: EngineBridgeService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    jest.clearAllMocks();

    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngineBridgeService,
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<EngineBridgeService>(EngineBridgeService);
  });

  describe('onModuleInit', () => {
    it('should initialize engine and set initialized flag', async () => {
      await service.onModuleInit();

      expect(service.isInitialized()).toBe(true);
      expect(mockAddon.initEngine).toHaveBeenCalledTimes(1);
      expect(mockAddon.onConditionMatch).toHaveBeenCalledTimes(1);
    });

    it('should handle addon load failure gracefully', async () => {
      // Temporarily make initEngine throw
      mockAddon.initEngine.mockImplementationOnce(() => {
        throw new Error('Addon not found');
      });

      await service.onModuleInit();

      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('condition management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should add a condition and return condition ID', () => {
      const condition = {
        id: 'cond-1',
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: JSON.stringify({ threshold: 150, operator: 'cross_above' }),
        channels: ['email'],
        active: true,
      };

      const result = service.addCondition(condition);
      expect(result).toBe('cond-1');
      expect(mockAddon.addCondition).toHaveBeenCalledWith(condition);
    });

    it('should remove a condition', () => {
      const result = service.removeCondition('cond-1');
      expect(result).toBe(true);
      expect(mockAddon.removeCondition).toHaveBeenCalledWith('cond-1');
    });

    it('should update a condition', () => {
      const condition = {
        id: 'cond-1',
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: JSON.stringify({ threshold: 200, operator: 'cross_above' }),
        channels: ['email'],
        active: true,
      };

      const result = service.updateCondition(condition);
      expect(result).toBe(true);
      expect(mockAddon.updateCondition).toHaveBeenCalledWith(condition);
    });

    it('should bulk load conditions', () => {
      const conditions = [
        {
          id: 'c1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          strategyType: 'threshold_crossing',
          strategyParams: '{}',
          channels: ['email'],
          active: true,
        },
      ];

      const result = service.bulkLoadConditions(conditions);
      expect(result).toBe(3);
      expect(mockAddon.bulkLoadConditions).toHaveBeenCalledWith(conditions);
    });

    it('should get condition count', () => {
      expect(service.getConditionCount()).toBe(5);
    });
  });

  describe('evaluateTick', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should evaluate a tick and return match results', () => {
      const tick = { symbol: 'AAPL', value: 160, timestampUs: 1000 };
      const matches = [
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
      mockAddon.evaluateTick.mockReturnValueOnce(matches);

      const result = service.evaluateTick(tick);
      expect(result).toEqual(matches);
      expect(mockAddon.evaluateTick).toHaveBeenCalledWith(tick);
    });
  });

  describe('match callback', () => {
    it('should emit engine.condition.match event via EventEmitter2', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      await service.onModuleInit();

      // Get the callback that was registered
      const callback = mockAddon.onConditionMatch.mock.calls[0][0];

      const batchJson = JSON.stringify({
        matches: [
          {
            conditionId: 'c1',
            organizationId: 'org-1',
            subscriberId: 'sub-1',
            symbol: 'AAPL',
            matchedValue: 160,
            channels: ['email'],
            timestampUs: 1000,
          },
        ],
        batch_timestamp_us: 1000,
      });

      // Simulate Rust calling the callback
      callback(null, batchJson);

      expect(emitSpy).toHaveBeenCalledWith(
        'engine.condition.match',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ conditionId: 'c1' }),
          ]),
        }),
      );
    });
  });

  describe('when not initialized', () => {
    it('should throw when calling methods before initialization', () => {
      expect(() => service.addCondition({} as any)).toThrow(
        'Rust engine not initialized',
      );
      expect(() => service.evaluateTick({} as any)).toThrow(
        'Rust engine not initialized',
      );
      expect(() => service.getMetrics()).toThrow(
        'Rust engine not initialized',
      );
    });
  });

  describe('getMetrics', () => {
    it('should return engine metrics', async () => {
      await service.onModuleInit();
      const metrics = service.getMetrics();
      expect(metrics).toEqual(
        expect.objectContaining({
          totalConditions: 5,
          ticksPerSecond: 50,
        }),
      );
    });
  });
});
