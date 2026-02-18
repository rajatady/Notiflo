import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ENGINE_BRIDGE, IEngineBridge } from '@notiflo/bridge/napi-bridge';
import {
  DashboardFiltersDto,
  DashboardOverview,
  ChannelHealth,
  ActiveCampaignSummary,
  TimelinePoint,
  ProviderHealth,
  TimeRange,
} from './dto/dashboard.dto';
import { NotificationDocument } from '../notifications/schemas/notification.schema';
import { Campaign } from '../campaigns/schemas/campaign.schema';
import { Workflow } from '../workflows/schemas/workflow.schema';
import { WorkflowExecution } from '../workflows/schemas/workflow-execution.schema';
import { Subscriber } from '../subscribers/schemas/subscriber.schema';
import { NotifloEventDocument } from '../events/schemas/event.schema';
import {
  Channel,
  NotificationStatus,
  CampaignStatus,
  WorkflowExecutionStatus,
} from '../core';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Optional()
    @Inject(ENGINE_BRIDGE)
    private readonly engineBridge: IEngineBridge | null,
    @InjectModel(NotificationDocument.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<Campaign>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<Workflow>,
    @InjectModel(WorkflowExecution.name)
    private readonly workflowExecutionModel: Model<WorkflowExecution>,
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: Model<Subscriber>,
    @InjectModel(NotifloEventDocument.name)
    private readonly eventModel: Model<NotifloEventDocument>,
  ) {}

  /**
   * Build a date-range filter from the DashboardFiltersDto.
   * Returns a MongoDB $gte/$lte condition for createdAt, or undefined.
   */
  private buildDateFilter(
    filters?: DashboardFiltersDto,
  ): { createdAt: { $gte: Date; $lte: Date } } | undefined {
    if (!filters) return undefined;

    let from: Date | undefined;
    let to: Date = new Date();

    if (filters.timeRange && filters.timeRange !== TimeRange.CUSTOM) {
      const now = Date.now();
      const rangeMs: Record<string, number> = {
        [TimeRange.LAST_HOUR]: 60 * 60 * 1000,
        [TimeRange.LAST_24H]: 24 * 60 * 60 * 1000,
        [TimeRange.LAST_7D]: 7 * 24 * 60 * 60 * 1000,
        [TimeRange.LAST_30D]: 30 * 24 * 60 * 60 * 1000,
      };
      from = new Date(now - rangeMs[filters.timeRange]);
    } else if (filters.from) {
      from = new Date(filters.from);
      if (filters.to) {
        to = new Date(filters.to);
      }
    }

    if (!from) return undefined;

    return { createdAt: { $gte: from, $lte: to } };
  }

  /**
   * Aggregate high-level stats: totals, delivery rate, active campaigns,
   * active workflows, subscriber count, recent events, channel breakdown.
   */
  async getOverview(
    orgId: string,
    filters?: DashboardFiltersDto,
  ): Promise<DashboardOverview> {
    const dateFilter = this.buildDateFilter(filters) ?? {};
    const baseMatch: Record<string, unknown> = {
      organizationId: orgId,
      ...dateFilter,
    };

    if (filters?.channel) {
      baseMatch.channel = filters.channel;
    }
    if (filters?.campaignId) {
      baseMatch.campaignId = filters.campaignId;
    }

    // Run independent queries in parallel
    const [
      statusAgg,
      channelAgg,
      activeCampaigns,
      activeWorkflows,
      totalSubscribers,
      recentEvents,
    ] = await Promise.all([
      // Notification counts by status
      this.notificationModel.aggregate<{
        _id: string;
        count: number;
      }>([
        { $match: baseMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Per-channel breakdown
      this.notificationModel.aggregate<{
        _id: string;
        sent: number;
        delivered: number;
        failed: number;
      }>([
        { $match: baseMatch },
        {
          $group: {
            _id: '$channel',
            sent: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [
                        NotificationStatus.SENT,
                        NotificationStatus.DELIVERED,
                        NotificationStatus.OPENED,
                        NotificationStatus.CLICKED,
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            delivered: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [
                        NotificationStatus.DELIVERED,
                        NotificationStatus.OPENED,
                        NotificationStatus.CLICKED,
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            failed: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [NotificationStatus.FAILED, NotificationStatus.BOUNCED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      // Active campaigns count
      this.campaignModel.countDocuments({
        organizationId: orgId,
        status: { $in: [CampaignStatus.RUNNING, CampaignStatus.SCHEDULED] },
      }),

      // Active workflow executions count
      this.workflowExecutionModel.countDocuments({
        organizationId: orgId,
        status: {
          $in: [
            WorkflowExecutionStatus.RUNNING,
            WorkflowExecutionStatus.WAITING,
          ],
        },
      }),

      // Total subscribers
      this.subscriberModel.countDocuments({ organizationId: orgId }),

      // Recent events (last 24h)
      this.eventModel.countDocuments({
        organizationId: orgId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    // Compute totals from status aggregation
    const statusMap = new Map(statusAgg.map((s) => [s._id, s.count]));

    const sentStatuses = [
      NotificationStatus.SENT,
      NotificationStatus.DELIVERED,
      NotificationStatus.OPENED,
      NotificationStatus.CLICKED,
    ];
    const deliveredStatuses = [
      NotificationStatus.DELIVERED,
      NotificationStatus.OPENED,
      NotificationStatus.CLICKED,
    ];
    const failedStatuses = [
      NotificationStatus.FAILED,
      NotificationStatus.BOUNCED,
    ];

    const totalSent = sentStatuses.reduce(
      (sum, s) => sum + (statusMap.get(s) ?? 0),
      0,
    );
    const totalDelivered = deliveredStatuses.reduce(
      (sum, s) => sum + (statusMap.get(s) ?? 0),
      0,
    );
    const totalFailed = failedStatuses.reduce(
      (sum, s) => sum + (statusMap.get(s) ?? 0),
      0,
    );

    const channelBreakdown = channelAgg.map((c) => ({
      channel: c._id,
      sent: c.sent,
      delivered: c.delivered,
      failed: c.failed,
      deliveryRate: c.sent > 0 ? Math.round((c.delivered / c.sent) * 10000) / 100 : 0,
    }));

    return {
      totalNotificationsSent: totalSent,
      totalDelivered,
      totalFailed,
      deliveryRate:
        totalSent > 0
          ? Math.round((totalDelivered / totalSent) * 10000) / 100
          : 0,
      activeCampaigns,
      activeWorkflows,
      totalSubscribers,
      recentEvents,
      channelBreakdown,
    };
  }

  /**
   * Per-channel health derived from recent notification data (last 5 minutes).
   */
  async getChannelHealth(orgId: string): Promise<ChannelHealth[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const channelStats = await this.notificationModel.aggregate<{
      _id: string;
      total: number;
      failed: number;
      avgLatency: number;
    }>([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: fiveMinAgo },
        },
      },
      {
        $group: {
          _id: '$channel',
          total: { $sum: 1 },
          failed: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [NotificationStatus.FAILED, NotificationStatus.BOUNCED],
                  ],
                },
                1,
                0,
              ],
            },
          },
          avgLatency: {
            $avg: {
              $cond: [
                { $and: [{ $ifNull: ['$sentAt', false] }, { $ifNull: ['$createdAt', false] }] },
                { $subtract: ['$sentAt', '$createdAt'] },
                0,
              ],
            },
          },
        },
      },
    ]);

    // Map provider counts per channel
    const providerCounts = await this.notificationModel.aggregate<{
      _id: { channel: string };
      providers: number;
    }>([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: fiveMinAgo },
        },
      },
      {
        $group: {
          _id: { channel: '$channel' },
          providerSet: { $addToSet: '$provider' },
        },
      },
      {
        $project: {
          _id: 1,
          providers: { $size: '$providerSet' },
        },
      },
    ]);

    const providerMap = new Map(
      providerCounts.map((p) => [p._id.channel, p.providers]),
    );

    return Object.values(Channel).map((ch) => {
      const stats = channelStats.find((s) => s._id === ch);
      const total = stats?.total ?? 0;
      const failed = stats?.failed ?? 0;
      const errorRate =
        total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;

      let status: 'healthy' | 'degraded' | 'down';
      if (total === 0) {
        status = 'healthy'; // No traffic is not necessarily down
      } else if (errorRate > 50) {
        status = 'down';
      } else if (errorRate > 10) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        channel: ch,
        status,
        throughputPerSecond:
          total > 0 ? Math.round((total / 300) * 100) / 100 : 0, // 300s = 5 min
        errorRate,
        avgLatencyMs: Math.round(stats?.avgLatency ?? 0),
        activeProviders: providerMap.get(ch) ?? 0,
        circuitBreakerState: status === 'down' ? 'open' : 'closed',
      };
    });
  }

  /**
   * Return active/running campaigns with progress metrics.
   */
  async getActiveCampaigns(
    orgId: string,
  ): Promise<ActiveCampaignSummary[]> {
    const campaigns = await this.campaignModel
      .find({
        organizationId: orgId,
        status: {
          $in: [CampaignStatus.RUNNING, CampaignStatus.SCHEDULED],
        },
      })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .exec();

    return campaigns.map((c: any) => {
      const analytics = c.analytics ?? {
        totalRecipients: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
      };
      const total = analytics.totalRecipients || 1; // avoid division by zero

      return {
        id: c._id.toString(),
        name: c.name,
        status: c.status,
        progress: Math.round(((analytics.sent + analytics.failed) / total) * 100),
        totalRecipients: analytics.totalRecipients,
        sent: analytics.sent,
        delivered: analytics.delivered,
        failed: analytics.failed,
        startedAt: c.createdAt?.toISOString() ?? new Date().toISOString(),
      };
    });
  }

  /**
   * Time-series notification data bucketed by hour or day depending on range.
   */
  async getTimeline(
    orgId: string,
    filters?: DashboardFiltersDto,
  ): Promise<TimelinePoint[]> {
    const dateFilter = this.buildDateFilter(filters);
    const match: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (dateFilter) {
      Object.assign(match, dateFilter);
    } else {
      // Default to last 24 hours
      match.createdAt = {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };
    }

    if (filters?.channel) {
      match.channel = filters.channel;
    }

    // Decide bucket size: hourly for ranges <= 7d, daily otherwise
    const isLargeRange =
      filters?.timeRange === TimeRange.LAST_30D ||
      (filters?.timeRange === TimeRange.CUSTOM &&
        filters.from &&
        filters.to &&
        new Date(filters.to).getTime() - new Date(filters.from).getTime() >
          7 * 24 * 60 * 60 * 1000);

    const dateFormat = isLargeRange ? '%Y-%m-%d' : '%Y-%m-%dT%H:00:00Z';

    const timeline = await this.notificationModel.aggregate<{
      _id: string;
      sent: number;
      delivered: number;
      failed: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          sent: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      NotificationStatus.SENT,
                      NotificationStatus.DELIVERED,
                      NotificationStatus.OPENED,
                      NotificationStatus.CLICKED,
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          delivered: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      NotificationStatus.DELIVERED,
                      NotificationStatus.OPENED,
                      NotificationStatus.CLICKED,
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [NotificationStatus.FAILED, NotificationStatus.BOUNCED],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return timeline.map((t) => ({
      timestamp: t._id,
      sent: t.sent,
      delivered: t.delivered,
      failed: t.failed,
    }));
  }

  /**
   * Per-provider health derived from recent notifications (last 5 min).
   */
  async getProviderHealth(orgId: string): Promise<ProviderHealth[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const providerStats = await this.notificationModel.aggregate<{
      _id: { provider: string; channel: string };
      total: number;
      succeeded: number;
      failed: number;
      avgLatency: number;
      lastError: string | null;
      lastErrorAt: Date | null;
    }>([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: fiveMinAgo },
        },
      },
      {
        $group: {
          _id: { provider: '$provider', channel: '$channel' },
          total: { $sum: 1 },
          succeeded: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      NotificationStatus.SENT,
                      NotificationStatus.DELIVERED,
                      NotificationStatus.OPENED,
                      NotificationStatus.CLICKED,
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [NotificationStatus.FAILED, NotificationStatus.BOUNCED],
                  ],
                },
                1,
                0,
              ],
            },
          },
          avgLatency: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$sentAt', false] },
                    { $ifNull: ['$createdAt', false] },
                  ],
                },
                { $subtract: ['$sentAt', '$createdAt'] },
                0,
              ],
            },
          },
          lastError: { $last: '$result.error' },
          lastErrorAt: {
            $max: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [NotificationStatus.FAILED, NotificationStatus.BOUNCED],
                  ],
                },
                '$updatedAt',
                null,
              ],
            },
          },
        },
      },
    ]);

    return providerStats.map((p) => {
      const successRate =
        p.total > 0
          ? Math.round((p.succeeded / p.total) * 10000) / 100
          : 100;

      let circuitBreakerState: string;
      if (successRate < 50) {
        circuitBreakerState = 'open';
      } else if (successRate < 80) {
        circuitBreakerState = 'half-open';
      } else {
        circuitBreakerState = 'closed';
      }

      return {
        provider: p._id.provider,
        channel: p._id.channel,
        status: successRate >= 80 ? 'active' : successRate >= 50 ? 'degraded' : 'error',
        circuitBreakerState,
        successRate,
        avgLatencyMs: Math.round(p.avgLatency ?? 0),
        rateLimitRemaining: -1, // Not tracked at DB level; -1 indicates unknown
        lastErrorAt: p.lastErrorAt?.toISOString(),
        lastError: p.lastError ?? undefined,
      };
    });
  }

  /**
   * Subscriber growth over time, bucketed by day.
   */
  async getSubscriberGrowth(
    orgId: string,
    filters?: DashboardFiltersDto,
  ): Promise<{ date: string; count: number }[]> {
    const dateFilter = this.buildDateFilter(filters);
    const match: Record<string, unknown> = { organizationId: orgId };

    if (dateFilter) {
      Object.assign(match, dateFilter);
    } else {
      // Default to last 30 days
      match.createdAt = {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      };
    }

    const growth = await this.subscriberModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return growth.map((g) => ({
      date: g._id,
      count: g.count,
    }));
  }

  /**
   * Rust condition engine status and metrics.
   */
  getEngineStatus(): Record<string, unknown> {
    if (!this.engineBridge || !this.engineBridge.isInitialized()) {
      return { available: false };
    }
    return {
      available: true,
      ...this.engineBridge.getMetrics(),
    };
  }

  /**
   * Active workflow executions with associated workflow name.
   */
  async getActiveWorkflows(orgId: string): Promise<any[]> {
    const executions = await this.workflowExecutionModel
      .find({
        organizationId: orgId,
        status: {
          $in: [
            WorkflowExecutionStatus.RUNNING,
            WorkflowExecutionStatus.WAITING,
            WorkflowExecutionStatus.PAUSED,
          ],
        },
      })
      .sort({ startedAt: -1 })
      .limit(50)
      .lean()
      .exec();

    if (executions.length === 0) return [];

    // Gather unique workflow IDs to look up names
    const workflowIds = [
      ...new Set(executions.map((e: any) => e.workflowId)),
    ];

    const workflows = await this.workflowModel
      .find({ _id: { $in: workflowIds } })
      .select('_id name')
      .lean()
      .exec();

    const workflowNameMap = new Map(
      workflows.map((w: any) => [w._id.toString(), w.name]),
    );

    return executions.map((e: any) => ({
      executionId: e._id.toString(),
      workflowId: e.workflowId,
      workflowName: workflowNameMap.get(e.workflowId) ?? 'Unknown',
      subscriberId: e.subscriberId,
      status: e.status,
      currentStepId: e.currentStepId,
      stepsCompleted: e.stepResults?.length ?? 0,
      startedAt: e.startedAt?.toISOString() ?? e.createdAt?.toISOString(),
      error: e.error,
    }));
  }
}
