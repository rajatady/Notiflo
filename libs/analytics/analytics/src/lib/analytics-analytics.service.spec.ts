import { Test } from '@nestjs/testing';
import { AnalyticsAnalyticsService } from './analytics-analytics.service';

describe('AnalyticsAnalyticsService', () => {
  let service: AnalyticsAnalyticsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AnalyticsAnalyticsService]
    }).compile();

    service = module.get(AnalyticsAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeTruthy();
  });
})
