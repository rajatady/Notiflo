import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

describe('AlertsController', () => {
  let controller: AlertsController;
  let mockAlertsService: any;

  beforeEach(async () => {
    mockAlertsService = {
      create: jest.fn().mockResolvedValue({ _id: 'alert-1', symbol: 'AAPL' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findBySymbol: jest.fn().mockResolvedValue([]),
      findBySubscriber: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(null),
      toggleActive: jest.fn().mockResolvedValue(null),
      evaluateTick: jest.fn().mockReturnValue([]),
      isEngineAvailable: jest.fn().mockReturnValue(true),
      getEngineMetrics: jest.fn().mockReturnValue({
        totalConditions: 5,
        totalTicksProcessed: 100,
        totalMatches: 10,
        ticksPerSecond: 50,
        matchesPerSecond: 5,
        avgEvaluationUs: 1.5,
        strategies: [],
      }),
      getEngineConditionCount: jest.fn().mockReturnValue(5),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: AlertsService, useValue: mockAlertsService },
      ],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
  });

  describe('POST /alerts', () => {
    it('should create a condition and return document', async () => {
      const dto = {
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 150, operator: 'cross_above' },
        channels: ['email'],
      };

      const result = await controller.create(dto as any);
      expect(result).toEqual(expect.objectContaining({ _id: 'alert-1' }));
      expect(mockAlertsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /alerts/ticks', () => {
    it('should accept a tick and return evaluation results', () => {
      const tick = { symbol: 'AAPL', value: 160, timestampUs: 1000 };
      const matches = [
        {
          conditionId: 'c1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email'],
        },
      ];
      mockAlertsService.evaluateTick.mockReturnValue(matches);

      const result = controller.submitTick(tick as any);
      expect(result).toMatchObject({ matches, count: 1 });
      expect(result).toHaveProperty('engineTimeUs');
      expect(result).toHaveProperty('conditionsEvaluated');
      expect(mockAlertsService.evaluateTick).toHaveBeenCalledWith(tick);
    });

    it('should throw 503 when engine not initialized', () => {
      mockAlertsService.isEngineAvailable.mockReturnValue(false);

      expect(() =>
        controller.submitTick({ symbol: 'AAPL', value: 160, timestampUs: 1000 } as any),
      ).toThrow(ServiceUnavailableException);
    });
  });

  describe('GET /alerts/count', () => {
    it('should return engine count', () => {
      const result = controller.getEngineCount();
      expect(result).toEqual({ count: 5 });
    });
  });

  describe('GET /alerts/metrics', () => {
    it('should return engine metrics', () => {
      const result = controller.getMetrics();
      expect(result).toEqual(
        expect.objectContaining({ totalConditions: 5 }),
      );
    });
  });

  describe('GET /alerts/by-symbol', () => {
    it('should query by organization and symbol', async () => {
      mockAlertsService.findBySymbol.mockResolvedValue([
        { symbol: 'AAPL', strategyType: 'threshold_crossing' },
      ]);

      const result = await controller.findBySymbol('org-1', 'AAPL');
      expect(result).toHaveLength(1);
      expect(mockAlertsService.findBySymbol).toHaveBeenCalledWith('org-1', 'AAPL');
    });
  });

  describe('GET /alerts/:id', () => {
    it('should return single alert', async () => {
      mockAlertsService.findOne.mockResolvedValue({ _id: 'alert-1' });
      const result = await controller.findOne('alert-1');
      expect(result).toEqual({ _id: 'alert-1' });
    });
  });

  describe('DELETE /alerts/:id', () => {
    it('should delete alert', async () => {
      mockAlertsService.remove.mockResolvedValue({ _id: 'alert-1' });
      const result = await controller.remove('alert-1');
      expect(result).toEqual({ _id: 'alert-1' });
    });
  });
});
