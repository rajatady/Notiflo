import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DashboardService } from './dashboard.service';
import { ENGINE_BRIDGE, IEngineBridge } from '@notiflo/bridge/napi-bridge';
import { NotificationDocument } from '../notifications/schemas/notification.schema';
import { Campaign } from '../campaigns/schemas/campaign.schema';
import { Workflow } from '../workflows/schemas/workflow.schema';
import { WorkflowExecution } from '../workflows/schemas/workflow-execution.schema';
import { Subscriber } from '../subscribers/schemas/subscriber.schema';
import { NotifloEventDocument } from '../events/schemas/event.schema';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockEngineBridge: jest.Mocked<IEngineBridge>;

  const mockModel = () => ({
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    mockEngineBridge = {
      isInitialized: jest.fn().mockReturnValue(true),
      addCondition: jest.fn(),
      removeCondition: jest.fn(),
      updateCondition: jest.fn(),
      bulkLoadConditions: jest.fn(),
      getConditionCount: jest.fn().mockReturnValue(10),
      evaluateTick: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        totalConditions: 10,
        totalTicksProcessed: 5000,
        totalMatches: 42,
        ticksPerSecond: 1000,
        matchesPerSecond: 8.4,
        avgEvaluationUs: 0.5,
        strategies: [
          { strategyType: 'threshold_crossing', conditionCount: 8 },
          { strategyType: 'expression', conditionCount: 2 },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: ENGINE_BRIDGE, useValue: mockEngineBridge },
        { provide: getModelToken(NotificationDocument.name), useValue: mockModel() },
        { provide: getModelToken(Campaign.name), useValue: mockModel() },
        { provide: getModelToken(Workflow.name), useValue: mockModel() },
        { provide: getModelToken(WorkflowExecution.name), useValue: mockModel() },
        { provide: getModelToken(Subscriber.name), useValue: mockModel() },
        { provide: getModelToken(NotifloEventDocument.name), useValue: mockModel() },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getEngineStatus', () => {
    it('should return engine metrics when initialized', () => {
      const result = service.getEngineStatus();
      expect(result).toEqual(
        expect.objectContaining({
          available: true,
          totalConditions: 10,
          ticksPerSecond: 1000,
          matchesPerSecond: 8.4,
          strategies: expect.arrayContaining([
            expect.objectContaining({ strategyType: 'threshold_crossing' }),
          ]),
        }),
      );
    });

    it('should return unavailable when engine not initialized', () => {
      mockEngineBridge.isInitialized.mockReturnValue(false);
      const result = service.getEngineStatus();
      expect(result).toEqual({ available: false });
    });
  });

  describe('getEngineStatus without bridge', () => {
    it('should return unavailable when bridge is null', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DashboardService,
          { provide: getModelToken(NotificationDocument.name), useValue: mockModel() },
          { provide: getModelToken(Campaign.name), useValue: mockModel() },
          { provide: getModelToken(Workflow.name), useValue: mockModel() },
          { provide: getModelToken(WorkflowExecution.name), useValue: mockModel() },
          { provide: getModelToken(Subscriber.name), useValue: mockModel() },
          { provide: getModelToken(NotifloEventDocument.name), useValue: mockModel() },
        ],
      }).compile();

      const svc = module.get<DashboardService>(DashboardService);
      expect(svc.getEngineStatus()).toEqual({ available: false });
    });
  });
});
