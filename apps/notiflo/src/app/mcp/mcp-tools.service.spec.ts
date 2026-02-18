import { Test, TestingModule } from '@nestjs/testing';
import { McpToolsService, McpTool, McpToolResult } from './mcp-tools.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import {
  Channel,
  NotificationStatus,
  CampaignStatus,
} from '../core';

describe('McpToolsService', () => {
  let service: McpToolsService;
  let mockOrchestratorService: Record<string, jest.Mock>;
  let mockTemplatesService: Record<string, jest.Mock>;
  let mockSubscribersService: Record<string, jest.Mock>;
  let mockNotificationsService: Record<string, jest.Mock>;
  let mockEventsService: Record<string, jest.Mock>;
  let mockCampaignsService: Record<string, jest.Mock>;
  let mockWorkflowsService: Record<string, jest.Mock>;
  let mockAlertsService: Record<string, jest.Mock>;

  const orgId = 'org-test-123';

  beforeEach(async () => {
    mockOrchestratorService = {
      sendNotification: jest.fn().mockResolvedValue({
        _id: 'notif-001',
        organizationId: orgId,
        subscriberId: 'sub-001',
        channel: Channel.EMAIL,
        status: NotificationStatus.SENT,
      }),
      sendMultiChannel: jest.fn().mockResolvedValue([
        {
          _id: 'notif-001',
          channel: Channel.EMAIL,
          status: NotificationStatus.SENT,
        },
        {
          _id: 'notif-002',
          channel: Channel.SMS,
          status: NotificationStatus.SENT,
        },
      ]),
      processEvent: jest.fn().mockResolvedValue({ processed: true }),
      triggerWorkflow: jest.fn().mockResolvedValue({
        id: 'exec-001',
        status: 'completed',
      }),
      executeCampaign: jest.fn().mockResolvedValue(undefined),
    };

    mockTemplatesService = {
      findAll: jest.fn().mockResolvedValue([
        { _id: 'tmpl-001', name: 'Welcome Email', active: true },
        { _id: 'tmpl-002', name: 'Order Confirmation', active: true },
      ]),
      findOne: jest.fn().mockResolvedValue({
        _id: 'tmpl-001',
        name: 'Welcome Email',
        active: true,
      }),
    };

    mockSubscribersService = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'sub-001',
        externalId: 'ext-001',
        name: 'John Doe',
        email: 'john@example.com',
      }),
      findAll: jest.fn().mockResolvedValue([
        { _id: 'sub-001', name: 'John Doe' },
        { _id: 'sub-002', name: 'Jane Doe' },
      ]),
    };

    mockNotificationsService = {
      findAll: jest.fn().mockResolvedValue([
        {
          _id: 'notif-001',
          channel: Channel.EMAIL,
          status: NotificationStatus.SENT,
        },
      ]),
      getStats: jest.fn().mockResolvedValue({
        total: 150,
        byStatus: {
          [NotificationStatus.SENT]: 100,
          [NotificationStatus.FAILED]: 20,
          [NotificationStatus.DELIVERED]: 30,
        },
        byChannel: {
          [Channel.EMAIL]: 100,
          [Channel.SMS]: 50,
        },
      }),
    };

    mockEventsService = {
      findAll: jest.fn().mockResolvedValue([
        { _id: 'evt-001', name: 'user.signup', organizationId: orgId },
        { _id: 'evt-002', name: 'order.created', organizationId: orgId },
      ]),
    };

    mockCampaignsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'camp-001',
        name: 'Welcome Campaign',
        status: CampaignStatus.DRAFT,
        channels: [Channel.EMAIL],
        analytics: {
          totalRecipients: 100,
          sent: 80,
          delivered: 75,
          failed: 5,
          opened: 40,
          clicked: 15,
          bounced: 2,
          unsubscribed: 1,
        },
      }),
      findAll: jest.fn().mockResolvedValue([
        { _id: 'camp-001', name: 'Welcome Campaign', status: CampaignStatus.DRAFT },
        { _id: 'camp-002', name: 'Summer Sale', status: CampaignStatus.RUNNING },
      ]),
      create: jest.fn().mockResolvedValue({
        _id: 'camp-003',
        name: 'New Campaign',
        status: CampaignStatus.DRAFT,
      }),
      update: jest.fn().mockResolvedValue({
        _id: 'camp-001',
        name: 'Welcome Campaign',
        status: CampaignStatus.APPROVED,
      }),
    };

    mockWorkflowsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'wf-001',
        name: 'Welcome Flow',
        active: true,
      }),
      create: jest.fn().mockResolvedValue({
        _id: 'wf-002',
        name: 'New Workflow',
        active: true,
      }),
    };

    mockAlertsService = {
      create: jest.fn().mockResolvedValue({
        _id: 'alert-001',
        organizationId: orgId,
        subscriberId: 'sub-001',
        symbol: 'BTC/USD',
        strategyType: 'threshold',
        active: true,
      }),
      findAll: jest.fn().mockResolvedValue([
        { _id: 'alert-001', symbol: 'BTC/USD', strategyType: 'threshold', active: true },
        { _id: 'alert-002', symbol: 'ETH/USD', strategyType: 'crossover', active: true },
      ]),
      evaluateTick: jest.fn().mockReturnValue([
        {
          conditionId: 'alert-001',
          symbol: 'BTC/USD',
          strategyType: 'threshold',
          triggeredAt: Date.now(),
        },
      ]),
      getEngineMetrics: jest.fn().mockReturnValue({
        conditionCount: 10,
        evaluationCount: 500,
        matchCount: 25,
      }),
      isEngineAvailable: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpToolsService,
        { provide: 'OrchestratorService', useValue: mockOrchestratorService },
        { provide: 'TemplatesService', useValue: mockTemplatesService },
        { provide: 'SubscribersService', useValue: mockSubscribersService },
        { provide: 'NotificationsService', useValue: mockNotificationsService },
        { provide: 'EventsService', useValue: mockEventsService },
        { provide: 'CampaignsService', useValue: mockCampaignsService },
        { provide: 'WorkflowsService', useValue: mockWorkflowsService },
        { provide: 'AlertsService', useValue: mockAlertsService },
      ],
    }).compile();

    service = module.get<McpToolsService>(McpToolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTools', () => {
    it('should list available tools', () => {
      const tools = service.getTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThanOrEqual(10);

      // Verify tool structure
      tools.forEach((tool: McpTool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      });

      // Check specific tools exist
      const toolNames = tools.map((t: McpTool) => t.name);
      expect(toolNames).toContain('send_notification');
      expect(toolNames).toContain('list_campaigns');
      expect(toolNames).toContain('get_campaign_analytics');
      expect(toolNames).toContain('approve_campaign');
      expect(toolNames).toContain('list_events');
      expect(toolNames).toContain('get_subscriber');
      expect(toolNames).toContain('create_campaign');
      expect(toolNames).toContain('trigger_workflow');
      expect(toolNames).toContain('list_templates');
      expect(toolNames).toContain('get_notification_stats');
    });

    it('should include alert tool definitions', () => {
      const tools = service.getTools();
      const toolNames = tools.map((t: McpTool) => t.name);

      expect(toolNames).toContain('create_price_alert');
      expect(toolNames).toContain('get_engine_status');
      expect(toolNames).toContain('submit_tick');
      expect(toolNames).toContain('list_alerts');
    });
  });

  describe('executeTool', () => {
    it('should handle send_notification tool call', async () => {
      const result: McpToolResult = await service.executeTool('send_notification', {
        organizationId: orgId,
        subscriberId: 'sub-001',
        channel: Channel.EMAIL,
        templateId: 'tmpl-001',
        variables: { name: 'John' },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBeFalsy();
      expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
        orgId,
        'sub-001',
        Channel.EMAIL,
        'tmpl-001',
        { name: 'John' },
        undefined,
      );
    });

    it('should handle list_campaigns tool call', async () => {
      const result: McpToolResult = await service.executeTool('list_campaigns', {
        organizationId: orgId,
      });

      expect(result).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBeFalsy();
      expect(mockCampaignsService.findAll).toHaveBeenCalled();

      const parsedContent = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent).toHaveLength(2);
    });

    it('should handle get_campaign_analytics tool call', async () => {
      const result: McpToolResult = await service.executeTool('get_campaign_analytics', {
        campaignId: 'camp-001',
      });

      expect(result).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBeFalsy();
      expect(mockCampaignsService.findOne).toHaveBeenCalledWith('camp-001');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.analytics).toBeDefined();
      expect(parsedContent.analytics.totalRecipients).toBe(100);
      expect(parsedContent.analytics.sent).toBe(80);
    });

    it('should handle approve_campaign tool call', async () => {
      mockCampaignsService.update.mockResolvedValue({
        _id: 'camp-001',
        name: 'Welcome Campaign',
        status: CampaignStatus.APPROVED,
      });

      const result: McpToolResult = await service.executeTool('approve_campaign', {
        campaignId: 'camp-001',
        approvedBy: 'admin-001',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockCampaignsService.update).toHaveBeenCalledWith(
        'camp-001',
        expect.objectContaining({
          status: CampaignStatus.APPROVED,
          approvedBy: 'admin-001',
        }),
      );
    });

    it('should handle list_events tool call', async () => {
      const result: McpToolResult = await service.executeTool('list_events', {
        organizationId: orgId,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockEventsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );

      const parsedContent = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent).toHaveLength(2);
    });

    it('should handle get_subscriber tool call', async () => {
      const result: McpToolResult = await service.executeTool('get_subscriber', {
        subscriberId: 'sub-001',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockSubscribersService.findOne).toHaveBeenCalledWith('sub-001');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.name).toBe('John Doe');
      expect(parsedContent.email).toBe('john@example.com');
    });

    it('should handle create_campaign tool call', async () => {
      const result: McpToolResult = await service.executeTool('create_campaign', {
        organizationId: orgId,
        name: 'New Campaign',
        channels: [Channel.EMAIL],
        templateIds: { [Channel.EMAIL]: 'tmpl-001' },
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockCampaignsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          name: 'New Campaign',
          channels: [Channel.EMAIL],
        }),
      );
    });

    it('should handle trigger_workflow tool call', async () => {
      const result: McpToolResult = await service.executeTool('trigger_workflow', {
        organizationId: orgId,
        workflowId: 'wf-001',
        subscriberId: 'sub-001',
        context: { trigger: 'mcp' },
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockOrchestratorService.triggerWorkflow).toHaveBeenCalledWith(
        orgId,
        'wf-001',
        'sub-001',
        { trigger: 'mcp' },
      );
    });

    it('should handle list_templates tool call', async () => {
      const result: McpToolResult = await service.executeTool('list_templates', {
        organizationId: orgId,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockTemplatesService.findAll).toHaveBeenCalledWith(orgId);

      const parsedContent = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent).toHaveLength(2);
    });

    it('should handle get_notification_stats tool call', async () => {
      const result: McpToolResult = await service.executeTool('get_notification_stats', {
        organizationId: orgId,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockNotificationsService.getStats).toHaveBeenCalledWith(orgId);

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.total).toBe(150);
      expect(parsedContent.byChannel).toBeDefined();
      expect(parsedContent.byStatus).toBeDefined();
    });

    it('should return error for unknown tool', async () => {
      const result: McpToolResult = await service.executeTool(
        'nonexistent_tool',
        {},
      );

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('nonexistent_tool');
    });

    it('should validate tool input parameters', async () => {
      // send_notification requires organizationId, subscriberId, channel, templateId
      const result: McpToolResult = await service.executeTool('send_notification', {
        // Missing required fields
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toMatch(
        /missing|required|invalid|validation/,
      );
    });
  });

  // --- Alert Tools Tests ---

  describe('create_price_alert tool', () => {
    it('should create an alert condition via AlertsService', async () => {
      const result: McpToolResult = await service.executeTool('create_price_alert', {
        organizationId: orgId,
        subscriberId: 'sub-001',
        symbol: 'BTC/USD',
        strategyType: 'threshold',
        strategyParams: { threshold: 50000, direction: 'above' },
        channels: ['email', 'push'],
        templateId: 'tmpl-alert-001',
        cooldownMs: 60000,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockAlertsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          subscriberId: 'sub-001',
          symbol: 'BTC/USD',
          strategyType: 'threshold',
          strategyParams: { threshold: 50000, direction: 'above' },
          channels: ['email', 'push'],
          templateId: 'tmpl-alert-001',
          cooldownMs: 60000,
          active: true,
        }),
      );

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent._id).toBe('alert-001');
      expect(parsedContent.symbol).toBe('BTC/USD');
    });

    it('should return error when required parameters are missing', async () => {
      const result: McpToolResult = await service.executeTool('create_price_alert', {
        organizationId: orgId,
        // Missing subscriberId, symbol, strategyType
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toMatch(/missing/);
    });
  });

  describe('get_engine_status tool', () => {
    it('should return engine availability and metrics', async () => {
      const result: McpToolResult = await service.executeTool('get_engine_status', {});

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockAlertsService.isEngineAvailable).toHaveBeenCalled();
      expect(mockAlertsService.getEngineMetrics).toHaveBeenCalled();

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.available).toBe(true);
      expect(parsedContent.metrics).toBeDefined();
      expect(parsedContent.metrics.conditionCount).toBe(10);
      expect(parsedContent.metrics.evaluationCount).toBe(500);
    });
  });

  describe('submit_tick tool', () => {
    it('should evaluate a tick and return matches', async () => {
      const result: McpToolResult = await service.executeTool('submit_tick', {
        symbol: 'BTC/USD',
        value: 51000,
        timestampUs: 1700000000000000,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockAlertsService.evaluateTick).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        value: 51000,
        timestampUs: 1700000000000000,
        secondaryValue: undefined,
        textContent: undefined,
        metadata: undefined,
      });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.matchCount).toBe(1);
      expect(parsedContent.matches).toHaveLength(1);
      expect(parsedContent.matches[0].conditionId).toBe('alert-001');
    });

    it('should return error when required parameters are missing', async () => {
      const result: McpToolResult = await service.executeTool('submit_tick', {
        symbol: 'BTC/USD',
        // Missing value and timestampUs
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toMatch(/missing/);
    });

    it('should return error when engine throws', async () => {
      mockAlertsService.evaluateTick.mockImplementation(() => {
        throw new Error('Engine not initialized');
      });

      const result: McpToolResult = await service.executeTool('submit_tick', {
        symbol: 'BTC/USD',
        value: 51000,
        timestampUs: 1700000000000000,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Engine not initialized');
    });
  });

  describe('list_alerts tool', () => {
    it('should list alerts for an organization', async () => {
      const result: McpToolResult = await service.executeTool('list_alerts', {
        organizationId: orgId,
        limit: 10,
        offset: 0,
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(mockAlertsService.findAll).toHaveBeenCalledWith(orgId, 10, 0);

      const parsedContent = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent).toHaveLength(2);
      expect(parsedContent[0].symbol).toBe('BTC/USD');
      expect(parsedContent[1].symbol).toBe('ETH/USD');
    });

    it('should return error when organizationId is missing', async () => {
      const result: McpToolResult = await service.executeTool('list_alerts', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toMatch(/missing/);
    });
  });
});
