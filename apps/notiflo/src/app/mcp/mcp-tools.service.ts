import { Inject, Injectable } from '@nestjs/common';
import { CampaignStatus } from '../core';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Service that exposes Notiflo's capabilities as MCP (Model Context Protocol) tools.
 * AI agents can discover and call these tools to interact with the notification platform.
 */
@Injectable()
export class McpToolsService {
  private readonly toolDefinitions: McpTool[];

  constructor(
    @Inject('OrchestratorService')
    private readonly orchestratorService: {
      sendNotification: (...args: any[]) => Promise<any>;
      sendMultiChannel: (...args: any[]) => Promise<any>;
      processEvent: (...args: any[]) => Promise<any>;
      triggerWorkflow: (...args: any[]) => Promise<any>;
      executeCampaign: (...args: any[]) => Promise<any>;
    },
    @Inject('TemplatesService')
    private readonly templatesService: {
      findAll: (orgId: string) => Promise<any[]>;
      findOne: (id: string) => Promise<any>;
    },
    @Inject('SubscribersService')
    private readonly subscribersService: {
      findOne: (id: string) => Promise<any>;
      findAll: (orgId: string, limit?: number, offset?: number) => Promise<any[]>;
    },
    @Inject('NotificationsService')
    private readonly notificationsService: {
      findAll: (query: any) => Promise<any[]>;
      getStats: (orgId: string) => Promise<any>;
    },
    @Inject('EventsService')
    private readonly eventsService: {
      findAll: (filter: any) => Promise<any[]>;
    },
    @Inject('CampaignsService')
    private readonly campaignsService: {
      findOne: (id: string) => Promise<any>;
      findAll: (query?: any) => Promise<any[]>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
    },
    @Inject('WorkflowsService')
    private readonly workflowsService: {
      findOne: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
    },
    @Inject('AlertsService')
    private readonly alertsService: {
      create: (dto: any) => Promise<any>;
      findAll: (organizationId: string, limit?: number, offset?: number) => Promise<any[]>;
      evaluateTick: (tick: any) => any[];
      getEngineMetrics: () => any;
      isEngineAvailable: () => boolean;
    },
  ) {
    this.toolDefinitions = this.buildToolDefinitions();
  }

  /**
   * Returns all available MCP tool definitions.
   */
  getTools(): McpTool[] {
    return this.toolDefinitions;
  }

  /**
   * Executes an MCP tool by name with the given arguments.
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const tool = this.toolDefinitions.find((t) => t.name === toolName);
    if (!tool) {
      return this.errorResult(`Unknown tool: ${toolName}`);
    }

    try {
      switch (toolName) {
        case 'send_notification':
          return this.handleSendNotification(args);
        case 'send_multi_channel':
          return this.handleSendMultiChannel(args);
        case 'list_campaigns':
          return this.handleListCampaigns(args);
        case 'get_campaign':
          return this.handleGetCampaign(args);
        case 'get_campaign_analytics':
          return this.handleGetCampaignAnalytics(args);
        case 'approve_campaign':
          return this.handleApproveCampaign(args);
        case 'reject_campaign':
          return this.handleRejectCampaign(args);
        case 'create_campaign':
          return this.handleCreateCampaign(args);
        case 'start_campaign':
          return this.handleStartCampaign(args);
        case 'list_events':
          return this.handleListEvents(args);
        case 'get_subscriber':
          return this.handleGetSubscriber(args);
        case 'list_subscribers':
          return this.handleListSubscribers(args);
        case 'create_workflow':
          return this.handleCreateWorkflow(args);
        case 'trigger_workflow':
          return this.handleTriggerWorkflow(args);
        case 'list_templates':
          return this.handleListTemplates(args);
        case 'get_notification_stats':
          return this.handleGetNotificationStats(args);
        case 'list_notifications':
          return this.handleListNotifications(args);
        case 'create_price_alert':
          return this.handleCreatePriceAlert(args);
        case 'get_engine_status':
          return this.handleGetEngineStatus();
        case 'submit_tick':
          return this.handleSubmitTick(args);
        case 'list_alerts':
          return this.handleListAlerts(args);
        default:
          return this.errorResult(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return this.errorResult(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // --- Tool Handlers ---

  private async handleSendNotification(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, subscriberId, channel, templateId, variables, metadata } = args;

    if (!organizationId || !subscriberId || !channel || !templateId) {
      return this.errorResult(
        'Missing required parameters: organizationId, subscriberId, channel, templateId',
      );
    }

    const result = await this.orchestratorService.sendNotification(
      organizationId as string,
      subscriberId as string,
      channel as string,
      templateId as string,
      (variables as Record<string, unknown>) || {},
      metadata as Record<string, unknown> | undefined,
    );

    return this.successResult(result);
  }

  private async handleSendMultiChannel(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, subscriberId, channels, templateId, variables } = args;

    if (!organizationId || !subscriberId || !channels || !templateId) {
      return this.errorResult(
        'Missing required parameters: organizationId, subscriberId, channels, templateId',
      );
    }

    const result = await this.orchestratorService.sendMultiChannel(
      organizationId as string,
      subscriberId as string,
      channels as string[],
      templateId as string,
      (variables as Record<string, unknown>) || {},
    );

    return this.successResult(result);
  }

  private async handleListCampaigns(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, status } = args;
    const query: Record<string, unknown> = {};
    if (organizationId) query.organizationId = organizationId;
    if (status) query.status = status;

    const campaigns = await this.campaignsService.findAll(query);
    return this.successResult(campaigns);
  }

  private async handleGetCampaign(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { campaignId } = args;
    if (!campaignId) {
      return this.errorResult('Missing required parameter: campaignId');
    }

    const campaign = await this.campaignsService.findOne(campaignId as string);
    return this.successResult(campaign);
  }

  private async handleGetCampaignAnalytics(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { campaignId } = args;
    if (!campaignId) {
      return this.errorResult('Missing required parameter: campaignId');
    }

    const campaign = await this.campaignsService.findOne(campaignId as string);
    if (!campaign) {
      return this.errorResult(`Campaign not found: ${campaignId}`);
    }

    return this.successResult({
      campaignId: campaign._id,
      name: campaign.name,
      status: campaign.status,
      analytics: campaign.analytics,
    });
  }

  private async handleApproveCampaign(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { campaignId, approvedBy } = args;
    if (!campaignId) {
      return this.errorResult('Missing required parameter: campaignId');
    }

    const result = await this.campaignsService.update(
      campaignId as string,
      {
        status: CampaignStatus.APPROVED,
        approvedBy: approvedBy as string,
        approvedAt: new Date(),
      },
    );

    return this.successResult(result);
  }

  private async handleRejectCampaign(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { campaignId, rejectedBy, reason } = args;
    if (!campaignId) {
      return this.errorResult('Missing required parameter: campaignId');
    }

    const result = await this.campaignsService.update(
      campaignId as string,
      {
        status: CampaignStatus.REJECTED,
        rejectedBy: rejectedBy as string,
        rejectedAt: new Date(),
        rejectionReason: reason as string,
      },
    );

    return this.successResult(result);
  }

  private async handleCreateCampaign(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, name, channels, templateIds, description, targetSegment, schedule } = args;

    if (!organizationId || !name || !channels) {
      return this.errorResult(
        'Missing required parameters: organizationId, name, channels',
      );
    }

    const result = await this.campaignsService.create({
      organizationId,
      name,
      channels,
      templateIds: templateIds || {},
      description,
      targetSegment,
      schedule,
      status: CampaignStatus.DRAFT,
    });

    return this.successResult(result);
  }

  private async handleStartCampaign(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { campaignId } = args;
    if (!campaignId) {
      return this.errorResult('Missing required parameter: campaignId');
    }

    const result = await this.campaignsService.update(
      campaignId as string,
      { status: CampaignStatus.RUNNING },
    );

    return this.successResult(result);
  }

  private async handleListEvents(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, name, subscriberId, limit, offset } = args;
    const filter: Record<string, unknown> = {};
    if (organizationId) filter.organizationId = organizationId;
    if (name) filter.name = name;
    if (subscriberId) filter.subscriberId = subscriberId;
    if (limit) filter.limit = limit;
    if (offset) filter.offset = offset;

    const events = await this.eventsService.findAll(filter);
    return this.successResult(events);
  }

  private async handleGetSubscriber(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { subscriberId } = args;
    if (!subscriberId) {
      return this.errorResult('Missing required parameter: subscriberId');
    }

    const subscriber = await this.subscribersService.findOne(subscriberId as string);
    return this.successResult(subscriber);
  }

  private async handleListSubscribers(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, limit, offset } = args;
    if (!organizationId) {
      return this.errorResult('Missing required parameter: organizationId');
    }

    const subscribers = await this.subscribersService.findAll(
      organizationId as string,
      limit as number,
      offset as number,
    );
    return this.successResult(subscribers);
  }

  private async handleCreateWorkflow(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, name, steps, entryStepId, description } = args;

    if (!organizationId || !name || !steps || !entryStepId) {
      return this.errorResult(
        'Missing required parameters: organizationId, name, steps, entryStepId',
      );
    }

    const result = await this.workflowsService.create({
      organizationId,
      name,
      steps,
      entryStepId,
      description,
      active: true,
    });

    return this.successResult(result);
  }

  private async handleTriggerWorkflow(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, workflowId, subscriberId, context } = args;

    if (!organizationId || !workflowId || !subscriberId) {
      return this.errorResult(
        'Missing required parameters: organizationId, workflowId, subscriberId',
      );
    }

    const result = await this.orchestratorService.triggerWorkflow(
      organizationId as string,
      workflowId as string,
      subscriberId as string,
      context as Record<string, unknown>,
    );

    return this.successResult(result);
  }

  private async handleListTemplates(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId } = args;
    if (!organizationId) {
      return this.errorResult('Missing required parameter: organizationId');
    }

    const templates = await this.templatesService.findAll(organizationId as string);
    return this.successResult(templates);
  }

  private async handleGetNotificationStats(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId } = args;
    if (!organizationId) {
      return this.errorResult('Missing required parameter: organizationId');
    }

    const stats = await this.notificationsService.getStats(organizationId as string);
    return this.successResult(stats);
  }

  private async handleListNotifications(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, subscriberId, channel, status, limit, offset } = args;
    const query: Record<string, unknown> = {};
    if (organizationId) query.organizationId = organizationId;
    if (subscriberId) query.subscriberId = subscriberId;
    if (channel) query.channel = channel;
    if (status) query.status = status;
    if (limit) query.limit = limit;
    if (offset) query.offset = offset;

    const notifications = await this.notificationsService.findAll(query);
    return this.successResult(notifications);
  }

  private async handleCreatePriceAlert(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, subscriberId, symbol, strategyType, strategyParams, channels, templateId, cooldownMs } = args;

    if (!organizationId || !subscriberId || !symbol || !strategyType) {
      return this.errorResult(
        'Missing required parameters: organizationId, subscriberId, symbol, strategyType',
      );
    }

    const result = await this.alertsService.create({
      organizationId,
      subscriberId,
      symbol,
      strategyType,
      strategyParams: strategyParams || {},
      channels: channels || [],
      templateId,
      cooldownMs: cooldownMs ?? 0,
      active: true,
    });

    return this.successResult(result);
  }

  private async handleGetEngineStatus(): Promise<McpToolResult> {
    const available = this.alertsService.isEngineAvailable();
    const metrics = this.alertsService.getEngineMetrics();
    return this.successResult({ available, metrics });
  }

  private async handleSubmitTick(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { symbol, value, timestampUs, secondaryValue, textContent, metadata } = args;

    if (!symbol || value === undefined || value === null || !timestampUs) {
      return this.errorResult(
        'Missing required parameters: symbol, value, timestampUs',
      );
    }

    try {
      const matches = this.alertsService.evaluateTick({
        symbol: symbol as string,
        value: value as number,
        timestampUs: timestampUs as number,
        secondaryValue: secondaryValue as number | undefined,
        textContent: textContent as string | undefined,
        metadata: metadata as string | undefined,
      });

      return this.successResult({ matches, matchCount: matches.length });
    } catch (error) {
      return this.errorResult(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleListAlerts(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const { organizationId, limit, offset } = args;

    if (!organizationId) {
      return this.errorResult('Missing required parameter: organizationId');
    }

    const alerts = await this.alertsService.findAll(
      organizationId as string,
      limit as number,
      offset as number,
    );

    return this.successResult(alerts);
  }

  // --- Helpers ---

  private successResult(data: unknown): McpToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private errorResult(message: string): McpToolResult {
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };
  }

  private buildToolDefinitions(): McpTool[] {
    return [
      {
        name: 'send_notification',
        description: 'Send a notification to a subscriber via a specific channel using a template',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string', description: 'Organization ID' },
            subscriberId: { type: 'string', description: 'Subscriber ID' },
            channel: { type: 'string', description: 'Channel (email, sms, push, etc.)' },
            templateId: { type: 'string', description: 'Template ID' },
            variables: { type: 'object', description: 'Template variables' },
            metadata: { type: 'object', description: 'Optional metadata' },
          },
          required: ['organizationId', 'subscriberId', 'channel', 'templateId'],
        },
      },
      {
        name: 'send_multi_channel',
        description: 'Send a notification via multiple channels simultaneously',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            subscriberId: { type: 'string' },
            channels: { type: 'array', items: { type: 'string' } },
            templateId: { type: 'string' },
            variables: { type: 'object' },
          },
          required: ['organizationId', 'subscriberId', 'channels', 'templateId'],
        },
      },
      {
        name: 'list_campaigns',
        description: 'List campaigns with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
      {
        name: 'get_campaign',
        description: 'Get campaign details including analytics',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'get_campaign_analytics',
        description: 'Get analytics data for a specific campaign',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'approve_campaign',
        description: 'Approve a pending campaign',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
            approvedBy: { type: 'string' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'reject_campaign',
        description: 'Reject a campaign with a reason',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
            rejectedBy: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'create_campaign',
        description: 'Create a new campaign',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            channels: { type: 'array', items: { type: 'string' } },
            templateIds: { type: 'object' },
            targetSegment: { type: 'object' },
            schedule: { type: 'object' },
          },
          required: ['organizationId', 'name', 'channels'],
        },
      },
      {
        name: 'start_campaign',
        description: 'Start an approved campaign',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'list_events',
        description: 'List events with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            name: { type: 'string' },
            subscriberId: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
      {
        name: 'get_subscriber',
        description: 'Get subscriber details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            subscriberId: { type: 'string' },
          },
          required: ['subscriberId'],
        },
      },
      {
        name: 'list_subscribers',
        description: 'List subscribers for an organization',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
          required: ['organizationId'],
        },
      },
      {
        name: 'create_workflow',
        description: 'Create a new workflow',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            steps: { type: 'array' },
            entryStepId: { type: 'string' },
          },
          required: ['organizationId', 'name', 'steps', 'entryStepId'],
        },
      },
      {
        name: 'trigger_workflow',
        description: 'Trigger a workflow execution for a subscriber',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            workflowId: { type: 'string' },
            subscriberId: { type: 'string' },
            context: { type: 'object' },
          },
          required: ['organizationId', 'workflowId', 'subscriberId'],
        },
      },
      {
        name: 'list_templates',
        description: 'List templates for an organization',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      {
        name: 'get_notification_stats',
        description: 'Get notification statistics for an organization',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      {
        name: 'list_notifications',
        description: 'List notifications with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            subscriberId: { type: 'string' },
            channel: { type: 'string' },
            status: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
      {
        name: 'create_price_alert',
        description: 'Create a price alert condition that triggers notifications when conditions are met',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string', description: 'Organization ID' },
            subscriberId: { type: 'string', description: 'Subscriber to notify' },
            symbol: { type: 'string', description: 'Symbol to monitor (e.g. BTC/USD)' },
            strategyType: { type: 'string', description: 'Alert strategy type (e.g. threshold, crossover)' },
            strategyParams: { type: 'object', description: 'Strategy-specific parameters' },
            channels: { type: 'array', items: { type: 'string' }, description: 'Notification channels' },
            templateId: { type: 'string', description: 'Notification template ID' },
            cooldownMs: { type: 'number', description: 'Cooldown between triggers in ms' },
          },
          required: ['organizationId', 'subscriberId', 'symbol', 'strategyType'],
        },
      },
      {
        name: 'get_engine_status',
        description: 'Get the status and metrics of the alert evaluation engine',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'submit_tick',
        description: 'Submit a price tick for evaluation against all loaded alert conditions and return matches',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol (e.g. BTC/USD)' },
            value: { type: 'number', description: 'Primary value (e.g. price)' },
            timestampUs: { type: 'number', description: 'Timestamp in microseconds' },
            secondaryValue: { type: 'number', description: 'Optional secondary value' },
            textContent: { type: 'string', description: 'Optional text content' },
            metadata: { type: 'string', description: 'Optional JSON metadata string' },
          },
          required: ['symbol', 'value', 'timestampUs'],
        },
      },
      {
        name: 'list_alerts',
        description: 'List alert conditions for an organization',
        inputSchema: {
          type: 'object',
          properties: {
            organizationId: { type: 'string', description: 'Organization ID' },
            limit: { type: 'number', description: 'Max results to return' },
            offset: { type: 'number', description: 'Results offset' },
          },
          required: ['organizationId'],
        },
      },
    ];
  }
}
