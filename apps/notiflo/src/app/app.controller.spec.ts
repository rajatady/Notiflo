import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return health status with ok status', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
      expect(result.timestamp).toBeDefined();
    });

    it('should return a valid ISO timestamp', () => {
      const result = controller.getHealth();
      const parsed = new Date(result.timestamp);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });
  });

  describe('getInfo', () => {
    it('should return platform info with name Notiflo', () => {
      const result = controller.getInfo();
      expect(result.name).toBe('Notiflo');
    });

    it('should list all core capabilities', () => {
      const result = controller.getInfo();
      expect(result.capabilities).toContain('multi-channel-notifications');
      expect(result.capabilities).toContain('workflow-automation');
      expect(result.capabilities).toContain('campaign-management');
      expect(result.capabilities).toContain('mcp-server');
      expect(result.capabilities).toContain('ai-agent-integration');
    });

    it('should list all invocation methods', () => {
      const result = controller.getInfo();
      expect(result.invocationMethods).toContain('REST API');
      expect(result.invocationMethods).toContain('MCP Server (AI Agents)');
      expect(result.invocationMethods).toContain('Event-driven (Webhooks)');
      expect(result.invocationMethods).toContain('Dashboard API');
    });

    it('should include version info', () => {
      const result = controller.getInfo();
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
