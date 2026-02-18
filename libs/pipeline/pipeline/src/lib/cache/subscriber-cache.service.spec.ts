import { Test, TestingModule } from '@nestjs/testing';
import { SubscriberCacheService } from './subscriber-cache.service';

describe('SubscriberCacheService', () => {
  let service: SubscriberCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriberCacheService],
    }).compile();

    service = module.get<SubscriberCacheService>(SubscriberCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
