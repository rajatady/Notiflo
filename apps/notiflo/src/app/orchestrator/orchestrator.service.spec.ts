import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import {
  Channel,
  SendResult,
  NotificationStatus,
  IChannelRegistry,
  ITemplateEngine,
  CHANNEL_REGISTRY,
  TEMPLATE_ENGINE,
  CampaignStatus,
  WorkflowExecutionStatus,
} from '../core';

describe('OrchestratorService', () => {
  let service: OrchestratorService;

  // Mock dependencies
  let mockChannelRegistry: jest.Mocked<IChannelRegistry>;
  let mockTemplateEngine: jest.Mocked<ITemplateEngine>;
  let mockTemplatesService: Record<string, jest.Mock>;
  let mockSubscribersService: Record<string, jest.Mock>;
  let mockNotificationsService: Record<string, jest.Mock>;
  let mockEventsService: Record<string, jest.Mock>;
  let mockWorkflowsService: Record<string, jest.Mock>;
  let mockWorkflowEngine: Record<string, jest.Mock>;
  let mockCampaignsService: Record<string, jest.Mock>;

  const orgId = 'org-test-123';
  const subscriberId = 'sub-001';
  const templateId = 'tmpl-001';

  const mockSubscriber = {
    _id: subscriberId,
    organizationId: orgId,
    externalId: 'ext-user-001',
    email: 'john@example.com',
    phone: '+1234567890',
    name: 'John Doe',
    channelPreferences: new Map([
      [Channel.EMAIL, { enabled: true }],
      [Channel.SMS, { enabled: true }],
      [Channel.PUSH, { enabled: false }],
    ]),
    pushTokens: ['token-abc'],
  };

  const mockTemplate = {
    _id: templateId,
    organizationId: orgId,
    name: 'Welcome Email',
    channels: {
      [Channel.EMAIL]: {
        subject: 'Welcome {{name}}',
        body: '<h1>Hello {{name}}</h1>',
      },
      [Channel.SMS]: {
        body: 'Welcome {{name}}!',
      },
    },
    variables: [{ name: 'name', type: 'string', required: true }],
    active: true,
    version: 1,
  };

  const mockSendResult: SendResult = {
    success: true,
    messageId: 'msg-123',
    providerName: 'sendgrid',
    channel: Channel.EMAIL,
    timestamp: new Date(),
  };

  const mockNotification = {
    _id: 'notif-001',
    organizationId: orgId,
    subscriberId,
    channel: Channel.EMAIL,
    templateId,
    status: NotificationStatus.SENT,
    provider: 'sendgrid',
    content: { subject: 'Welcome John', body: '<h1>Hello John</h1>' },
    result: { success: true, messageId: 'msg-123' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockChannelRegistry = {
      register: jest.fn(),
      getProvider: jest.fn().mockReturnValue({
        channel: Channel.EMAIL,
        name: 'sendgrid',
        send: jest.fn().mockResolvedValue(mockSendResult),
        validateConfig: jest.fn().mockResolvedValue(true),
        getStatus: jest.fn().mockReturnValue('active'),
      }),
      getProviders: jest.fn().mockReturnValue([]),
      getChannels: jest.fn().mockReturnValue([Channel.EMAIL, Channel.SMS]),
      hasActiveProvider: jest.fn().mockReturnValue(true),
      unregister: jest.fn(),
    };

    mockTemplateEngine = {
      render: jest.fn().mockReturnValue('Hello John'),
      renderForChannel: jest.fn().mockReturnValue({
        channel: Channel.EMAIL,
        subject: 'Welcome John',
        body: '<h1>Hello John</h1>',
        metadata: undefined,
      }),
      validate: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      extractVariables: jest.fn().mockReturnValue(['name']),
    };

    mockTemplatesService = {
      findOne: jest.fn().mockResolvedValue(mockTemplate),
      findAll: jest.fn().mockResolvedValue([mockTemplate]),
    };

    mockSubscribersService = {
      findOne: jest.fn().mockResolvedValue(mockSubscriber),
      findAll: jest.fn().mockResolvedValue([mockSubscriber]),
      findBySegment: jest.fn().mockResolvedValue([mockSubscriber]),
    };

    mockNotificationsService = {
      create: jest.fn().mockResolvedValue(mockNotification),
      findAll: jest.fn().mockResolvedValue([mockNotification]),
      getStats: jest.fn().mockResolvedValue({
        total: 1,
        byStatus: { [NotificationStatus.SENT]: 1 },
        byChannel: { [Channel.EMAIL]: 1 },
      }),
    };

    mockEventsService = {
      ingest: jest.fn().mockResolvedValue({
        _id: 'evt-001',
        organizationId: orgId,
        name: 'user.signup',
        payload: {},
        processed: false,
      }),
      findAll: jest.fn().mockResolvedValue([]),
      markProcessed: jest.fn().mockResolvedValue({ processed: true }),
    };

    mockWorkflowsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'wf-001',
        organizationId: orgId,
        name: 'Welcome Flow',
        active: true,
        steps: [],
        entryStepId: 'step-1',
      }),
      findByTriggerEvent: jest.fn().mockResolvedValue([
        {
          _id: 'wf-001',
          organizationId: orgId,
          name: 'Welcome Flow',
          active: true,
          steps: [
            {
              id: 'step-1',
              type: 'trigger',
              config: { triggerType: 'event', eventName: 'user.signup' },
            },
          ],
          entryStepId: 'step-1',
        },
      ]),
    };

    mockWorkflowEngine = {
      execute: jest.fn().mockResolvedValue({
        id: 'exec-001',
        workflowId: 'wf-001',
        organizationId: orgId,
        subscriberId,
        status: WorkflowExecutionStatus.COMPLETED,
        currentStepId: 'step-1',
        context: {},
        stepResults: [],
        startedAt: new Date(),
        completedAt: new Date(),
      }),
    };

    mockCampaignsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'camp-001',
        organizationId: orgId,
        name: 'Welcome Campaign',
        channels: [Channel.EMAIL],
        templateIds: { [Channel.EMAIL]: templateId },
        status: CampaignStatus.RUNNING,
        analytics: {
          totalRecipients: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
        },
      }),
      update: jest.fn().mockImplementation((_id, dto) =>
        Promise.resolve({ _id: 'camp-001', ...dto }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: CHANNEL_REGISTRY, useValue: mockChannelRegistry },
        { provide: TEMPLATE_ENGINE, useValue: mockTemplateEngine },
        { provide: 'TemplatesService', useValue: mockTemplatesService },
        { provide: 'SubscribersService', useValue: mockSubscribersService },
        { provide: 'NotificationsService', useValue: mockNotificationsService },
        { provide: 'EventsService', useValue: mockEventsService },
        { provide: 'WorkflowsService', useValue: mockWorkflowsService },
        { provide: 'WorkflowEngine', useValue: mockWorkflowEngine },
        { provide: 'CampaignsService', useValue: mockCampaignsService },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    it('should send a notification to a subscriber via a channel using a template', async () => {
      const result = await service.sendNotification(
        orgId,
        subscriberId,
        Channel.EMAIL,
        templateId,
        { name: 'John' },
      );

      // 1. Resolves subscriber
      expect(mockSubscribersService.findOne).toHaveBeenCalledWith(subscriberId);

      // 2. Finds template
      expect(mockTemplatesService.findOne).toHaveBeenCalledWith(templateId);

      // 3. Renders template for channel
      expect(mockTemplateEngine.renderForChannel).toHaveBeenCalledWith(
        mockTemplate.channels[Channel.EMAIL],
        { name: 'John' },
        Channel.EMAIL,
      );

      // 4. Sends via channel provider
      expect(mockChannelRegistry.getProvider).toHaveBeenCalledWith(Channel.EMAIL, undefined);

      // 5. Creates notification record
      expect(mockNotificationsService.create).toHaveBeenCalled();
      const createCall = mockNotificationsService.create.mock.calls[0][0];
      expect(createCall.organizationId).toBe(orgId);
      expect(createCall.subscriberId).toBe(subscriberId);
      expect(createCall.channel).toBe(Channel.EMAIL);
      expect(createCall.templateId).toBe(templateId);
      expect(createCall.status).toBe(NotificationStatus.SENT);

      // 6. Returns notification
      expect(result).toBeDefined();
      expect(result._id).toBe('notif-001');
    });

    it('should respect subscriber channel preferences (skip disabled channels)', async () => {
      // PUSH is disabled in mockSubscriber preferences
      const result = await service.sendNotification(
        orgId,
        subscriberId,
        Channel.PUSH,
        templateId,
        { name: 'John' },
      );

      // Should NOT call provider send since channel is disabled
      const provider = mockChannelRegistry.getProvider(Channel.PUSH);
      // The notification should be recorded as skipped or the method returns null
      expect(result).toBeNull();
      // Notification create should NOT be called for skipped channels
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });

    it('should handle channel send failure and record it', async () => {
      const failedSendResult: SendResult = {
        success: false,
        providerName: 'sendgrid',
        channel: Channel.EMAIL,
        error: 'Gateway timeout',
        timestamp: new Date(),
      };

      const failedProvider = {
        channel: Channel.EMAIL,
        name: 'sendgrid',
        send: jest.fn().mockResolvedValue(failedSendResult),
        validateConfig: jest.fn().mockResolvedValue(true),
        getStatus: jest.fn().mockReturnValue('active'),
      };
      mockChannelRegistry.getProvider.mockReturnValue(failedProvider);

      mockNotificationsService.create.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.FAILED,
        result: { success: false, error: 'Gateway timeout' },
      });

      const result = await service.sendNotification(
        orgId,
        subscriberId,
        Channel.EMAIL,
        templateId,
        { name: 'John' },
      );

      expect(result).toBeDefined();
      expect(mockNotificationsService.create).toHaveBeenCalled();
      const createCall = mockNotificationsService.create.mock.calls[0][0];
      expect(createCall.status).toBe(NotificationStatus.FAILED);
      expect(createCall.result.success).toBe(false);
      expect(createCall.result.error).toBe('Gateway timeout');
    });
  });

  describe('sendMultiChannel', () => {
    it('should send to multiple channels simultaneously', async () => {
      mockTemplateEngine.renderForChannel
        .mockReturnValueOnce({
          channel: Channel.EMAIL,
          subject: 'Welcome John',
          body: '<h1>Hello John</h1>',
        })
        .mockReturnValueOnce({
          channel: Channel.SMS,
          body: 'Welcome John!',
        });

      const smsProvider = {
        channel: Channel.SMS,
        name: 'twilio',
        send: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'sms-123',
          providerName: 'twilio',
          channel: Channel.SMS,
          timestamp: new Date(),
        }),
        validateConfig: jest.fn().mockResolvedValue(true),
        getStatus: jest.fn().mockReturnValue('active'),
      };

      mockChannelRegistry.getProvider.mockImplementation((channel) => {
        if (channel === Channel.SMS) return smsProvider;
        return {
          channel: Channel.EMAIL,
          name: 'sendgrid',
          send: jest.fn().mockResolvedValue(mockSendResult),
          validateConfig: jest.fn().mockResolvedValue(true),
          getStatus: jest.fn().mockReturnValue('active'),
        };
      });

      const results = await service.sendMultiChannel(
        orgId,
        subscriberId,
        [Channel.EMAIL, Channel.SMS],
        templateId,
        { name: 'John' },
      );

      expect(results).toBeDefined();
      expect(results).toHaveLength(2);
      // Both channels should have notifications created
      expect(mockNotificationsService.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('processEvent', () => {
    it('should process an incoming event (ingest + trigger matching workflows)', async () => {
      const result = await service.processEvent(
        orgId,
        'user.signup',
        subscriberId,
        { email: 'john@example.com' },
      );

      // 1. Ingests event
      expect(mockEventsService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          name: 'user.signup',
          subscriberId,
          payload: { email: 'john@example.com' },
        }),
      );

      // 2. Finds matching workflows
      expect(mockWorkflowsService.findByTriggerEvent).toHaveBeenCalledWith(
        orgId,
        'user.signup',
      );

      // 3. Executes matching workflows
      expect(mockWorkflowEngine.execute).toHaveBeenCalled();
    });
  });

  describe('triggerWorkflow', () => {
    it('should trigger a workflow for a subscriber', async () => {
      const result = await service.triggerWorkflow(
        orgId,
        'wf-001',
        subscriberId,
        { source: 'manual' },
      );

      expect(mockWorkflowsService.findOne).toHaveBeenCalledWith('wf-001');
      expect(mockWorkflowEngine.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'wf-001',
          organizationId: orgId,
        }),
        subscriberId,
        { source: 'manual' },
      );
      expect(result).toBeDefined();
      expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    });
  });

  describe('executeCampaign', () => {
    it('should execute a campaign (find target subscribers, send to each)', async () => {
      await service.executeCampaign('camp-001');

      // 1. Find campaign
      expect(mockCampaignsService.findOne).toHaveBeenCalledWith('camp-001');

      // 2. Find target subscribers
      expect(mockSubscribersService.findAll).toHaveBeenCalled();

      // 3. Send notification for each subscriber / channel combo
      expect(mockNotificationsService.create).toHaveBeenCalled();
    });

    it('should update campaign analytics as notifications are sent', async () => {
      await service.executeCampaign('camp-001');

      // Campaign update should have been called with analytics
      expect(mockCampaignsService.update).toHaveBeenCalled();
      const updateCall = mockCampaignsService.update.mock.calls[0];
      expect(updateCall[0]).toBe('camp-001');
      const analyticsUpdate = updateCall[1].analytics;
      expect(analyticsUpdate).toBeDefined();
      expect(analyticsUpdate.sent).toBeGreaterThanOrEqual(0);
      expect(analyticsUpdate.totalRecipients).toBeGreaterThanOrEqual(0);
    });

    it('should not execute a campaign that is not in RUNNING status', async () => {
      mockCampaignsService.findOne.mockResolvedValue({
        _id: 'camp-002',
        organizationId: orgId,
        name: 'Draft Campaign',
        channels: [Channel.EMAIL],
        templateIds: { [Channel.EMAIL]: templateId },
        status: CampaignStatus.DRAFT,
        analytics: {
          totalRecipients: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
        },
      });

      await expect(service.executeCampaign('camp-002')).rejects.toThrow();
    });
  });
});
