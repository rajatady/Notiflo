import { Test } from '@nestjs/testing';
import { PipelinePipelineService } from './pipeline-pipeline.service';

describe('PipelinePipelineService', () => {
  let service: PipelinePipelineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PipelinePipelineService]
    }).compile();

    service = module.get(PipelinePipelineService);
  });

  it('should be defined', () => {
    expect(service).toBeTruthy();
  });
})
