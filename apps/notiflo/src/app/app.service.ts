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
    invocationMethods: string[];
  } {
    return {
      name: 'Notiflo',
      description:
        'AI-native multi-channel marketing orchestration platform',
      version: '1.0.0',
      capabilities: [
        'multi-channel-notifications',
        'template-engine',
        'workflow-automation',
        'campaign-management',
        'event-driven-triggers',
        'subscriber-management',
        'channel-preferences',
        'campaign-approval-workflow',
        'ai-agent-integration',
        'mcp-server',
        'real-time-analytics',
      ],
      invocationMethods: [
        'REST API',
        'MCP Server (AI Agents)',
        'Event-driven (Webhooks)',
        'Dashboard API',
      ],
    };
  }
}
