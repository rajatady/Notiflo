import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; version: string; timestamp: string } {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  getInfo(): {
    name: string;
    description: string;
    version: string;
    capabilities: string[];
  } {
    return {
      name: 'Notiflo',
      description:
        'Real-time alerting pipeline — stream ingestion, condition evaluation, multi-channel delivery',
      version: '1.0.0',
      capabilities: [
        'drift-sentinel-evaluation-engine',
        'multi-channel-delivery',
        'pluggable-strategies',
        'subscriber-management',
        'template-engine',
      ],
    };
  }
}
