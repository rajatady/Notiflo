import { Module, Global } from '@nestjs/common';
import { EngineBridgeService } from './engine-bridge.service';
import { ENGINE_BRIDGE } from './engine-bridge.interface';

@Global()
@Module({
  providers: [
    EngineBridgeService,
    {
      provide: ENGINE_BRIDGE,
      useExisting: EngineBridgeService,
    },
  ],
  exports: [EngineBridgeService, ENGINE_BRIDGE],
})
export class NapiBridgeModule {}
