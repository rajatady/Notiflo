import { Test, TestingModule } from '@nestjs/testing';
import { TemplateCacheService } from './template-cache.service';

describe('TemplateCacheService', () => {
  let service: TemplateCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateCacheService],
    }).compile();

    service = module.get<TemplateCacheService>(TemplateCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
