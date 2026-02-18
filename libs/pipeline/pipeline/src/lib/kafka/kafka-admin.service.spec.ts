import { Test, TestingModule } from '@nestjs/testing';
import { KafkaAdminService } from './kafka-admin.service';

describe('KafkaAdminService', () => {
  let service: KafkaAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaAdminService],
    }).compile();

    service = module.get<KafkaAdminService>(KafkaAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
