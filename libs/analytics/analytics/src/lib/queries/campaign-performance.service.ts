import { Injectable, Logger } from '@nestjs/common';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

export interface CampaignMetrics {
	campaign_id: string;
	org_id: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	total_opened: number;
	total_clicked: number;
	total_bounced: number;
	deliveryRate: number;
	openRate: number;
	clickRate: number;
	channels: CampaignChannelBreakdown[];
}

export interface CampaignChannelBreakdown {
	channel: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	total_opened: number;
	total_clicked: number;
	total_bounced: number;
}

export interface CampaignTimelinePoint {
	timestamp: string;
	sent: number;
	delivered: number;
	failed: number;
	opened: number;
	clicked: number;
}

export interface CampaignComparison {
	campaign_id: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	total_opened: number;
	total_clicked: number;
	deliveryRate: number;
	openRate: number;
	clickRate: number;
}

export interface CampaignRanking {
	campaign_id: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	total_opened: number;
	total_clicked: number;
	deliveryRate: number;
	openRate: number;
	clickRate: number;
}

export interface ActiveCampaignProgress {
	campaign_id: string;
	channel: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	updated_at: string;
	deliveryRate: number;
}

@Injectable()
export class CampaignPerformanceService {
	private readonly logger = new Logger(CampaignPerformanceService.name);

	constructor(private readonly clickhouse: ClickhouseService) {}

	async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
		// Get per-channel breakdown using FINAL to apply ReplacingMergeTree dedup
		const channelSql = `
			SELECT
				channel,
				total_sent,
				total_delivered,
				total_failed,
				total_opened,
				total_clicked,
				total_bounced
			FROM campaign_analytics FINAL
			WHERE campaign_id = {campaignId:String}
			ORDER BY total_sent DESC
		`;

		const channels = await this.clickhouse.query<CampaignChannelBreakdown>(channelSql, { campaignId });
		const channelRows = Array.isArray(channels) ? channels : [];

		if (channelRows.length === 0) return null;

		// Aggregate totals
		const aggregateSql = `
			SELECT
				campaign_id,
				org_id,
				sum(total_sent) AS total_sent,
				sum(total_delivered) AS total_delivered,
				sum(total_failed) AS total_failed,
				sum(total_opened) AS total_opened,
				sum(total_clicked) AS total_clicked,
				sum(total_bounced) AS total_bounced
			FROM campaign_analytics FINAL
			WHERE campaign_id = {campaignId:String}
			GROUP BY campaign_id, org_id
		`;

		const aggregateResult = await this.clickhouse.query<{
			campaign_id: string;
			org_id: string;
			total_sent: number;
			total_delivered: number;
			total_failed: number;
			total_opened: number;
			total_clicked: number;
			total_bounced: number;
		}>(aggregateSql, { campaignId });

		const rows = Array.isArray(aggregateResult) ? aggregateResult : [];
		if (rows.length === 0) return null;

		const agg = rows[0];
		return {
			campaign_id: agg.campaign_id,
			org_id: agg.org_id,
			total_sent: Number(agg.total_sent),
			total_delivered: Number(agg.total_delivered),
			total_failed: Number(agg.total_failed),
			total_opened: Number(agg.total_opened),
			total_clicked: Number(agg.total_clicked),
			total_bounced: Number(agg.total_bounced),
			deliveryRate: agg.total_sent > 0 ? Math.round((Number(agg.total_delivered) / Number(agg.total_sent)) * 10000) / 100 : 0,
			openRate: agg.total_delivered > 0 ? Math.round((Number(agg.total_opened) / Number(agg.total_delivered)) * 10000) / 100 : 0,
			clickRate: agg.total_delivered > 0 ? Math.round((Number(agg.total_clicked) / Number(agg.total_delivered)) * 10000) / 100 : 0,
			channels: channelRows,
		};
	}

	async getCampaignTimeline(
		campaignId: string,
		interval: 'minute' | 'hour' | 'day' = 'hour',
	): Promise<CampaignTimelinePoint[]> {
		const truncFn =
			interval === 'minute'
				? 'toStartOfMinute'
				: interval === 'hour'
					? 'toStartOfHour'
					: 'toStartOfDay';

		const sql = `
			SELECT
				${truncFn}(created_at) AS timestamp,
				countIf(status = 'sent') AS sent,
				countIf(status = 'delivered') AS delivered,
				countIf(status = 'failed') AS failed,
				countIf(status = 'opened') AS opened,
				countIf(status = 'clicked') AS clicked
			FROM notification_events
			WHERE campaign_id = {campaignId:String}
			GROUP BY timestamp
			ORDER BY timestamp ASC
		`;

		const result = await this.clickhouse.query<CampaignTimelinePoint>(sql, { campaignId });
		return Array.isArray(result) ? result : [];
	}

	async compareCampaigns(campaignIds: string[]): Promise<CampaignComparison[]> {
		if (campaignIds.length === 0) return [];

		// Build parameterized IN clause
		const placeholders = campaignIds.map((_, i) => `{cid_${i}:String}`).join(', ');
		const params: Record<string, string | number> = {};
		campaignIds.forEach((id, i) => {
			params[`cid_${i}`] = id;
		});

		const sql = `
			SELECT
				campaign_id,
				sum(total_sent) AS total_sent,
				sum(total_delivered) AS total_delivered,
				sum(total_failed) AS total_failed,
				sum(total_opened) AS total_opened,
				sum(total_clicked) AS total_clicked,
				if(sum(total_sent) > 0,
					round(sum(total_delivered) / sum(total_sent) * 100, 2),
					0
				) AS deliveryRate,
				if(sum(total_delivered) > 0,
					round(sum(total_opened) / sum(total_delivered) * 100, 2),
					0
				) AS openRate,
				if(sum(total_delivered) > 0,
					round(sum(total_clicked) / sum(total_delivered) * 100, 2),
					0
				) AS clickRate
			FROM campaign_analytics FINAL
			WHERE campaign_id IN (${placeholders})
			GROUP BY campaign_id
			ORDER BY total_sent DESC
		`;

		const result = await this.clickhouse.query<CampaignComparison>(sql, params);
		return Array.isArray(result) ? result : [];
	}

	async getCampaignsByPerformance(
		orgId: string,
		sortBy: 'deliveryRate' | 'openRate' | 'clickRate' | 'total_sent' = 'deliveryRate',
		limit = 20,
	): Promise<CampaignRanking[]> {
		const sql = `
			SELECT
				campaign_id,
				sum(total_sent) AS total_sent,
				sum(total_delivered) AS total_delivered,
				sum(total_failed) AS total_failed,
				sum(total_opened) AS total_opened,
				sum(total_clicked) AS total_clicked,
				if(sum(total_sent) > 0,
					round(sum(total_delivered) / sum(total_sent) * 100, 2),
					0
				) AS deliveryRate,
				if(sum(total_delivered) > 0,
					round(sum(total_opened) / sum(total_delivered) * 100, 2),
					0
				) AS openRate,
				if(sum(total_delivered) > 0,
					round(sum(total_clicked) / sum(total_delivered) * 100, 2),
					0
				) AS clickRate
			FROM campaign_analytics FINAL
			WHERE org_id = {orgId:String}
			GROUP BY campaign_id
			ORDER BY ${sortBy} DESC
			LIMIT {limit:UInt32}
		`;

		const result = await this.clickhouse.query<CampaignRanking>(sql, { orgId, limit });
		return Array.isArray(result) ? result : [];
	}

	async getActiveCampaignProgress(orgId: string): Promise<ActiveCampaignProgress[]> {
		const sql = `
			SELECT
				campaign_id,
				channel,
				total_sent,
				total_delivered,
				total_failed,
				updated_at,
				if(total_sent > 0,
					round(total_delivered / total_sent * 100, 2),
					0
				) AS deliveryRate
			FROM campaign_analytics FINAL
			WHERE org_id = {orgId:String}
				AND updated_at >= now() - INTERVAL 24 HOUR
			ORDER BY updated_at DESC
		`;

		const result = await this.clickhouse.query<ActiveCampaignProgress>(sql, { orgId });
		return Array.isArray(result) ? result : [];
	}
}
