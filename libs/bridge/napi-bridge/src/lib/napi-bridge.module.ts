import { Module, Global } from '@nestjs/common';
import { EngineBridgeService } from './engine-bridge.service';

@Global()
@Module({
  providers: [EngineBridgeService],
  exports: [EngineBridgeService],
})
export class NapiBridgeModule {}
