import { Test, TestingModule } from '@nestjs/testing';
import { PluginsService } from './plugins.service';
import { PluginRegistryService } from './registry/plugin-registry.service';
import { HookRegistryService } from './registry/hook-registry.service';

describe('PluginsService', () => {
  let service: PluginsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginsService, PluginRegistryService, HookRegistryService],
    }).compile();

    service = module.get<PluginsService>(PluginsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
