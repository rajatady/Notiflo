import { Injectable, Logger } from '@nestjs/common';
import { NotificationAnalyticsService, AnalyticsFilters } from '../queries/notification-analytics.service';
import { CampaignPerformanceService } from '../queries/campaign-performance.service';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

export interface NotificationTrace {
	event_id: string;
	org_id: string;
	subscriber_id: string;
	channel: string;
	provider: string;
	status: string;
	campaign_id: string;
	workflow_id: string;
	template_id: string;
	created_at: string;
	sent_at: string | null;
	delivered_at: string | null;
	error: string;
	metadata: string;
}

export interface SubscriberJourneyEntry {
	event_id: string;
	channel: string;
	provider: string;
	status: string;
	template_id: string;
	campaign_id: string;
	created_at: string;
	sent_at: string | null;
	delivered_at: string | null;
}

export interface AnomalyReport {
	channel: string;
	provider: string;
	lastHourSent: number;
	lastHourFailed: number;
	last24hAvgSent: number;
	last24hAvgFailed: number;
	sentDropPercent: number;
	failureRateLastHour: number;
	failureRateLast24h: number;
	isAnomaly: boolean;
	reason: string;
}

export interface CrossChannelCorrelation {
	channel_a: string;
	channel_b: string;
	both_engaged: number;
	only_a_engaged: number;
	only_b_engaged: number;
	neither_engaged: number;
	correlation_score: number;
}

export interface FunnelStep {
	step_name: string;
	total_entered: number;
	total_completed: number;
	conversionRate: number;
	dropOffRate: number;
}

type QueryType = 'deliveryRates' | 'openRates' | 'timeSeries' | 'providerPerformance' | 'topTemplates' | 'campaignMetrics' | 'campaignComparison';

export interface StructuredQuery {
	type: QueryType;
	params: Record<string, unknown>;
}

@Injectable()
export class AiVisibilityService {
	private readonly logger = new Logger(AiVisibilityService.name);

	constructor(
		private readonly notificationAnalytics: NotificationAnalyticsService,
		private readonly campaignPerformance: CampaignPerformanceService,
		private readonly clickhouse: ClickhouseService,
	) {}

	async traceNotification(notificationId: string): Promise<NotificationTrace[]> {
		const sql = `
			SELECT
				event_id,
				org_id,
				subscriber_id,
				channel,
				provider,
				status,
				campaign_id,
				workflow_id,
				template_id,
				created_at,
				sent_at,
				delivered_at,
				error,
				metadata
			FROM notification_events
			WHERE event_id = {notificationId:String}
			ORDER BY created_at ASC
		`;

		const result = await this.clickhouse.query<NotificationTrace>(sql, { notificationId });
		return Array.isArray(result) ? result : [];
	}

	async subscriberJourney(orgId: string, subscriberId: string): Promise<SubscriberJourneyEntry[]> {
		const sql = `
			SELECT
				event_id,
				channel,
				provider,
				status,
				template_id,
				campaign_id,
				created_at,
				sent_at,
				delivered_at
			FROM notification_events
			WHERE org_id = {orgId:String}
				AND subscriber_id = {subscriberId:String}
			ORDER BY created_at ASC
		`;

		const result = await this.clickhouse.query<SubscriberJourneyEntry>(sql, { orgId, subscriberId });
		return Array.isArray(result) ? result : [];
	}

	async anomalyReport(orgId: string): Promise<AnomalyReport[]> {
		const sql = `
			WITH
				last_hour AS (
					SELECT
						channel,
						provider,
						count() AS total_sent,
						countIf(status = 'failed') AS total_failed
					FROM notification_events
					WHERE org_id = {orgId:String}
						AND created_at >= now() - INTERVAL 1 HOUR
					GROUP BY channel, provider
				),
				last_24h AS (
					SELECT
						channel,
						provider,
						count() / 24 AS avg_sent_per_hour,
						countIf(status = 'failed') / 24 AS avg_failed_per_hour
					FROM notification_events
					WHERE org_id = {orgId:String}
						AND created_at >= now() - INTERVAL 24 HOUR
					GROUP BY channel, provider
				)
			SELECT
				coalesce(h.channel, d.channel) AS channel,
				coalesce(h.provider, d.provider) AS provider,
				coalesce(h.total_sent, 0) AS lastHourSent,
				coalesce(h.total_failed, 0) AS lastHourFailed,
				round(coalesce(d.avg_sent_per_hour, 0), 2) AS last24hAvgSent,
				round(coalesce(d.avg_failed_per_hour, 0), 2) AS last24hAvgFailed,
				if(d.avg_sent_per_hour > 0,
					round((1 - coalesce(h.total_sent, 0) / d.avg_sent_per_hour) * 100, 2),
					0
				) AS sentDropPercent,
				if(coalesce(h.total_sent, 0) > 0,
					round(coalesce(h.total_failed, 0) / h.total_sent * 100, 2),
					0
				) AS failureRateLastHour,
				if(d.avg_sent_per_hour > 0,
					round(d.avg_failed_per_hour / d.avg_sent_per_hour * 100, 2),
					0
				) AS failureRateLast24h,
				if(
					(d.avg_sent_per_hour > 0 AND (1 - coalesce(h.total_sent, 0) / d.avg_sent_per_hour) > 0.5)
					OR
					(coalesce(h.total_sent, 0) > 0 AND coalesce(h.total_failed, 0) / h.total_sent > 0.2),
					1, 0
				) AS isAnomaly,
				multiIf(
					d.avg_sent_per_hour > 0 AND (1 - coalesce(h.total_sent, 0) / d.avg_sent_per_hour) > 0.5,
						'Significant drop in send volume compared to 24h average',
					coalesce(h.total_sent, 0) > 0 AND coalesce(h.total_failed, 0) / h.total_sent > 0.2,
						'High failure rate in the last hour',
					'No anomaly detected'
				) AS reason
			FROM last_hour h
			FULL OUTER JOIN last_24h d ON h.channel = d.channel AND h.provider = d.provider
			ORDER BY isAnomaly DESC, lastHourSent DESC
		`;

		const result = await this.clickhouse.query<AnomalyReport>(sql, { orgId });
		const rows = Array.isArray(result) ? result : [];
		return rows.map((r) => ({
			...r,
			isAnomaly: Boolean(r.isAnomaly),
		}));
	}

	async crossChannelCorrelation(orgId: string, from: string, to: string): Promise<CrossChannelCorrelation[]> {
		// Get distinct channels first
		const channelsSql = `
			SELECT DISTINCT channel
			FROM notification_events
			WHERE org_id = {orgId:String}
				AND created_at >= {from:String}
				AND created_at <= {to:String}
			ORDER BY channel
		`;

		const channelRows = await this.clickhouse.query<{ channel: string }>(channelsSql, { orgId, from, to });
		const channels = Array.isArray(channelRows) ? channelRows.map((r) => r.channel) : [];

		if (channels.length < 2) return [];

		// For each pair, compute correlation
		const correlations: CrossChannelCorrelation[] = [];

		for (let i = 0; i < channels.length; i++) {
			for (let j = i + 1; j < channels.length; j++) {
				const sql = `
					WITH
						a_subs AS (
							SELECT DISTINCT subscriber_id
							FROM notification_events
							WHERE org_id = {orgId:String}
								AND channel = {channelA:String}
								AND status IN ('delivered', 'opened', 'clicked')
								AND created_at >= {from:String}
								AND created_at <= {to:String}
						),
						b_subs AS (
							SELECT DISTINCT subscriber_id
							FROM notification_events
							WHERE org_id = {orgId:String}
								AND channel = {channelB:String}
								AND status IN ('delivered', 'opened', 'clicked')
								AND created_at >= {from:String}
								AND created_at <= {to:String}
						),
						all_subs AS (
							SELECT DISTINCT subscriber_id
							FROM notification_events
							WHERE org_id = {orgId:String}
								AND channel IN ({channelA:String}, {channelB:String})
								AND created_at >= {from:String}
								AND created_at <= {to:String}
						)
					SELECT
						countIf(subscriber_id IN (SELECT subscriber_id FROM a_subs) AND subscriber_id IN (SELECT subscriber_id FROM b_subs)) AS both_engaged,
						countIf(subscriber_id IN (SELECT subscriber_id FROM a_subs) AND subscriber_id NOT IN (SELECT subscriber_id FROM b_subs)) AS only_a_engaged,
						countIf(subscriber_id NOT IN (SELECT subscriber_id FROM a_subs) AND subscriber_id IN (SELECT subscriber_id FROM b_subs)) AS only_b_engaged,
						countIf(subscriber_id NOT IN (SELECT subscriber_id FROM a_subs) AND subscriber_id NOT IN (SELECT subscriber_id FROM b_subs)) AS neither_engaged
					FROM all_subs
				`;

				const result = await this.clickhouse.query<{
					both_engaged: number;
					only_a_engaged: number;
					only_b_engaged: number;
					neither_engaged: number;
				}>(sql, {
					orgId,
					channelA: channels[i],
					channelB: channels[j],
					from,
					to,
				});

				const rows = Array.isArray(result) ? result : [];
				if (rows.length > 0) {
					const r = rows[0];
					const total = Number(r.both_engaged) + Number(r.only_a_engaged) + Number(r.only_b_engaged) + Number(r.neither_engaged);
					correlations.push({
						channel_a: channels[i],
						channel_b: channels[j],
						both_engaged: Number(r.both_engaged),
						only_a_engaged: Number(r.only_a_engaged),
						only_b_engaged: Number(r.only_b_engaged),
						neither_engaged: Number(r.neither_engaged),
						correlation_score: total > 0
							? Math.round((Number(r.both_engaged) / total) * 10000) / 100
							: 0,
					});
				}
			}
		}

		return correlations;
	}

	async funnelAnalysis(orgId: string, workflowId: string): Promise<FunnelStep[]> {
		const sql = `
			SELECT
				status AS step_name,
				count() AS total_entered,
				countIf(status IN ('sent', 'delivered', 'opened', 'clicked')) AS total_completed
			FROM notification_events
			WHERE org_id = {orgId:String}
				AND workflow_id = {workflowId:String}
			GROUP BY status
			ORDER BY
				multiIf(
					status = 'pending', 1,
					status = 'sent', 2,
					status = 'delivered', 3,
					status = 'opened', 4,
					status = 'clicked', 5,
					status = 'failed', 6,
					status = 'bounced', 7,
					99
				) ASC
		`;

		const rows = await this.clickhouse.query<{
			step_name: string;
			total_entered: number;
			total_completed: number;
		}>(sql, { orgId, workflowId });

		const resultRows = Array.isArray(rows) ? rows : [];
		if (resultRows.length === 0) return [];

		const firstStepCount = Number(resultRows[0].total_entered);
		return resultRows.map((row, index) => {
			const entered = Number(row.total_entered);
			const prevEntered = index === 0 ? entered : Number(resultRows[index - 1].total_entered);
			return {
				step_name: row.step_name,
				total_entered: entered,
				total_completed: Number(row.total_completed),
				conversionRate: firstStepCount > 0
					? Math.round((entered / firstStepCount) * 10000) / 100
					: 0,
				dropOffRate: prevEntered > 0 && index > 0
					? Math.round(((prevEntered - entered) / prevEntered) * 10000) / 100
					: 0,
			};
		});
	}

	async queryAnalytics(orgId: string, query: StructuredQuery): Promise<unknown> {
		const { type, params } = query;

		switch (type) {
			case 'deliveryRates':
				return this.notificationAnalytics.getDeliveryRates(orgId, params as AnalyticsFilters);

			case 'openRates':
				return this.notificationAnalytics.getOpenRates(orgId, params as AnalyticsFilters);

			case 'timeSeries':
				return this.notificationAnalytics.getTimeSeriesMetrics(
					orgId,
					(params['interval'] as 'minute' | 'hour' | 'day') ?? 'hour',
					params['from'] as string,
					params['to'] as string,
				);

			case 'providerPerformance':
				return this.notificationAnalytics.getProviderPerformance(orgId);

			case 'topTemplates':
				return this.notificationAnalytics.getTopTemplates(orgId, (params['limit'] as number) ?? 10);

			case 'campaignMetrics':
				return this.campaignPerformance.getCampaignMetrics(params['campaignId'] as string);

			case 'campaignComparison':
				return this.campaignPerformance.compareCampaigns(params['campaignIds'] as string[]);

			default:
				throw new Error(`Unknown query type: ${type}`);
		}
	}
}
