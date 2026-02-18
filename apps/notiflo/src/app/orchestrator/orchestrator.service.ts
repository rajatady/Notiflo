import { Inject, Injectable } from '@nestjs/common';
import {
  Channel,
  SendResult,
  NotificationStatus,
  IChannelRegistry,
  ITemplateEngine,
  CHANNEL_REGISTRY,
  TEMPLATE_ENGINE,
  CampaignStatus,
  CampaignStatusError,
} from '../core';

/**
 * Central orchestration service that ties all Notiflo modules together.
 * Main entry point for sending notifications, processing events,
 * triggering workflows, and executing campaigns.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(CHANNEL_REGISTRY)
    private readonly channelRegistry: IChannelRegistry,
    @Inject(TEMPLATE_ENGINE)
    private readonly templateEngine: ITemplateEngine,
    @Inject('TemplatesService')
    private readonly templatesService: {
      findOne: (id: string) => Promise<any>;
      findAll: (orgId?: string) => Promise<any[]>;
    },
    @Inject('SubscribersService')
    private readonly subscribersService: {
      findOne: (id: string) => Promise<any>;
      findAll: (orgId: string, limit?: number, offset?: number) => Promise<any[]>;
      findBySegment: (orgId: string, filters: any[]) => Promise<any[]>;
    },
    @Inject('NotificationsService')
    private readonly notificationsService: {
      create: (data: any) => Promise<any>;
      findAll: (query: any) => Promise<any[]>;
      getStats: (orgId: string) => Promise<any>;
    },
    @Inject('EventsService')
    private readonly eventsService: {
      ingest: (data: any) => Promise<any>;
      findAll: (filter: any) => Promise<any[]>;
      markProcessed: (id: string) => Promise<any>;
    },
    @Inject('WorkflowsService')
    private readonly workflowsService: {
      findOne: (id: string) => Promise<any>;
      findByTriggerEvent: (orgId: string, eventName: string) => Promise<any[]>;
    },
    @Inject('WorkflowEngine')
    private readonly workflowEngine: {
      execute: (workflow: any, subscriberId: string, context?: any) => Promise<any>;
    },
    @Inject('CampaignsService')
    private readonly campaignsService: {
      findOne: (id: string) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
    },
  ) {}

  /**
   * Send a notification to a single subscriber via a specific channel using a template.
   *
   * Flow:
   * 1. Find subscriber
   * 2. Check channel preference
   * 3. Find template
   * 4. Render template for channel
   * 5. Build channel message
   * 6. Send via channel provider
   * 7. Create notification record
   * 8. Return notification
   */
  async sendNotification(
    orgId: string,
    subscriberId: string,
    channel: Channel,
    templateId: string,
    variables: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<any> {
    // 1. Find subscriber
    const subscriber = await this.subscribersService.findOne(subscriberId);
    if (!subscriber) {
      return null;
    }

    // 2. Check channel preference
    if (subscriber.channelPreferences) {
      const pref = subscriber.channelPreferences instanceof Map
        ? subscriber.channelPreferences.get(channel)
        : subscriber.channelPreferences[channel];

      if (pref && pref.enabled === false) {
        return null;
      }
    }

    // 3. Find template
    const template = await this.templatesService.findOne(templateId);
    if (!template) {
      return null;
    }

    // 4. Render template for channel
    const channelTemplate = template.channels[channel];
    if (!channelTemplate) {
      return null;
    }

    const rendered = this.templateEngine.renderForChannel(
      channelTemplate,
      variables,
      channel,
    );

    // 5. Get channel provider and send
    const provider = this.channelRegistry.getProvider(channel, undefined);
    let sendResult: SendResult;

    if (provider) {
      sendResult = await provider.send(this.buildChannelMessage(
        channel,
        subscriber,
        rendered,
      ) as never);
    } else {
      sendResult = {
        success: false,
        providerName: 'none',
        channel,
        error: 'No provider configured for channel',
        timestamp: new Date(),
      };
    }

    // 6. Determine notification status
    const status = sendResult.success
      ? NotificationStatus.SENT
      : NotificationStatus.FAILED;

    // 7. Create notification record
    const notification = await this.notificationsService.create({
      organizationId: orgId,
      subscriberId,
      channel,
      templateId,
      status,
      provider: sendResult.providerName,
      content: {
        subject: rendered.subject,
        body: rendered.body,
      },
      result: {
        success: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
      },
      metadata,
    });

    return notification;
  }

  /**
   * Send a notification to a subscriber across multiple channels simultaneously.
   */
  async sendMultiChannel(
    orgId: string,
    subscriberId: string,
    channels: Channel[],
    templateId: string,
    variables: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<any[]> {
    const results = await Promise.all(
      channels.map((channel) =>
        this.sendNotification(
          orgId,
          subscriberId,
          channel,
          templateId,
          variables,
          metadata,
        ),
      ),
    );

    // Filter out nulls (skipped channels)
    return results.filter((r) => r !== null);
  }

  /**
   * Process an incoming event: ingest it and trigger matching workflows.
   */
  async processEvent(
    orgId: string,
    eventName: string,
    subscriberId?: string,
    payload?: Record<string, unknown>,
  ): Promise<any> {
    // 1. Ingest event
    const event = await this.eventsService.ingest({
      organizationId: orgId,
      name: eventName,
      subscriberId,
      payload: payload || {},
      source: 'api',
    });

    // 2. Find active workflows triggered by this event
    const workflows = await this.workflowsService.findByTriggerEvent(
      orgId,
      eventName,
    );

    // 3. Execute each matching workflow
    const executions = await Promise.all(
      workflows.map((workflow: any) =>
        this.workflowEngine.execute(workflow, subscriberId, {
          event,
          payload: payload || {},
        }),
      ),
    );

    // 4. Mark event as processed
    await this.eventsService.markProcessed(event._id.toString());

    return { event, executions };
  }

  /**
   * Trigger a specific workflow for a subscriber.
   */
  async triggerWorkflow(
    orgId: string,
    workflowId: string,
    subscriberId: string,
    context?: Record<string, unknown>,
  ): Promise<any> {
    const workflow = await this.workflowsService.findOne(workflowId);
    if (!workflow) {
      return null;
    }

    return this.workflowEngine.execute(workflow, subscriberId, context);
  }

  /**
   * Execute a campaign: find target subscribers and send notifications to each.
   */
  async executeCampaign(campaignId: string): Promise<void> {
    // 1. Find campaign
    const campaign = await this.campaignsService.findOne(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // 2. Verify status is RUNNING
    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new CampaignStatusError(
        campaignId,
        campaign.status,
        CampaignStatus.RUNNING,
      );
    }

    // 3. Find target subscribers
    let subscribers: any[];
    if (campaign.targetSegment && campaign.targetSegment.filters) {
      subscribers = await this.subscribersService.findBySegment(
        campaign.organizationId,
        campaign.targetSegment.filters,
      );
    } else {
      subscribers = await this.subscribersService.findAll(
        campaign.organizationId,
      );
    }

    // 4. For each subscriber, for each channel, send notification
    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      for (const channel of campaign.channels) {
        const templateId = campaign.templateIds[channel];
        if (!templateId) continue;

        try {
          const result = await this.sendNotification(
            campaign.organizationId,
            subscriber._id.toString(),
            channel,
            templateId,
            {},
            { campaignId },
          );

          if (result && result.status === NotificationStatus.SENT) {
            sent++;
          } else if (result && result.status === NotificationStatus.FAILED) {
            failed++;
          }
        } catch {
          failed++;
        }
      }
    }

    // 5. Update analytics
    await this.campaignsService.update(campaignId, {
      analytics: {
        ...campaign.analytics,
        totalRecipients: subscribers.length,
        sent,
        failed,
      },
    });
  }

  /**
   * Builds a channel-appropriate message from render results and subscriber data.
   */
  private buildChannelMessage(
    channel: Channel,
    subscriber: any,
    rendered: any,
  ): Record<string, unknown> {
    switch (channel) {
      case Channel.EMAIL:
        return {
          to: subscriber.email,
          subject: rendered.subject,
          html: rendered.body,
        };
      case Channel.SMS:
        return {
          to: subscriber.phone,
          body: rendered.body,
        };
      case Channel.PUSH:
        return {
          title: rendered.subject || '',
          body: rendered.body,
          tokens: subscriber.pushTokens || [],
        };
      case Channel.IN_APP:
        return {
          subscriberId: subscriber._id.toString(),
          title: rendered.subject || '',
          body: rendered.body,
        };
      default:
        return {
          body: rendered.body,
          subject: rendered.subject,
        };
    }
  }
}
