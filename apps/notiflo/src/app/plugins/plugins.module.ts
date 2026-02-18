import { Module } from '@nestjs/common';
import { PluginsController, HooksController } from './plugins.controller';
import { PluginsService } from './plugins.service';
import { PluginRegistryService } from './registry/plugin-registry.service';
import { HookRegistryService } from './registry/hook-registry.service';
import { HookExecutorService } from './execution/hook-executor.service';

@Module({
  controllers: [PluginsController, HooksController],
  providers: [
    PluginsService,
    PluginRegistryService,
    HookRegistryService,
    HookExecutorService,
  ],
  exports: [HookExecutorService, HookRegistryService],
})
export class PluginsModule {}
