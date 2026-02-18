import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let mockDashboardService: any;

  beforeEach(async () => {
    mockDashboardService = {
      getOverview: jest.fn().mockResolvedValue({}),
      getChannelHealth: jest.fn().mockResolvedValue([]),
      getActiveCampaigns: jest.fn().mockResolvedValue([]),
      getTimeline: jest.fn().mockResolvedValue([]),
      getProviderHealth: jest.fn().mockResolvedValue([]),
      getSubscriberGrowth: jest.fn().mockResolvedValue([]),
      getActiveWorkflows: jest.fn().mockResolvedValue([]),
      getEngineStatus: jest.fn().mockReturnValue({
        available: true,
        totalConditions: 5,
        totalTicksProcessed: 100,
        totalMatches: 10,
        ticksPerSecond: 50,
        matchesPerSecond: 5,
        avgEvaluationUs: 1.5,
        strategies: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  describe('GET /dashboard/engine', () => {
    it('should return engine metrics when available', () => {
      const result = controller.getEngineStatus();
      expect(result).toEqual(
        expect.objectContaining({
          available: true,
          totalConditions: 5,
          ticksPerSecond: 50,
        }),
      );
    });

    it('should return unavailable when engine is not initialized', () => {
      mockDashboardService.getEngineStatus.mockReturnValue({
        available: false,
      });

      const result = controller.getEngineStatus();
      expect(result).toEqual({ available: false });
    });
  });

  describe('GET /dashboard/overview', () => {
    it('should delegate to dashboardService.getOverview', async () => {
      await controller.getOverview({} as any, 'org-1');
      expect(mockDashboardService.getOverview).toHaveBeenCalledWith('org-1', {});
    });
  });
});
