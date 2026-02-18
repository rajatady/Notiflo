import { Test, TestingModule } from '@nestjs/testing';
import { CampaignPerformanceService } from './campaign-performance.service';

describe('CampaignPerformanceService', () => {
  let service: CampaignPerformanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CampaignPerformanceService],
    }).compile();

    service = module.get<CampaignPerformanceService>(CampaignPerformanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
