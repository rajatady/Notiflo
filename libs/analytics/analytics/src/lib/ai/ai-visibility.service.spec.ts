import { Test, TestingModule } from '@nestjs/testing';
import { AiVisibilityService } from './ai-visibility.service';

describe('AiVisibilityService', () => {
  let service: AiVisibilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiVisibilityService],
    }).compile();

    service = module.get<AiVisibilityService>(AiVisibilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
