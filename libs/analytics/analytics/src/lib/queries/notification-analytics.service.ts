import { Injectable, Logger } from '@nestjs/common';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

export interface AnalyticsFilters {
	from?: string;
	to?: string;
	channel?: string;
	provider?: string;
	templateId?: string;
	campaignId?: string;
}

export interface DeliveryRateResult {
	channel: string;
	sent: number;
	delivered: number;
	failed: number;
	deliveryRate: number;
}

export interface OpenRateResult {
	channel: string;
	delivered: number;
	opened: number;
	clicked: number;
	openRate: number;
	clickRate: number;
}

export interface TimeSeriesMetric {
	timestamp: string;
	sent: number;
	delivered: number;
	failed: number;
}

export interface ProviderPerformanceResult {
	provider: string;
	channel: string;
	sent: number;
	delivered: number;
	failed: number;
	avgLatencyMs: number;
}

export interface TopTemplateResult {
	template_id: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	deliveryRate: number;
}

@Injectable()
export class NotificationAnalyticsService {
	private readonly logger = new Logger(NotificationAnalyticsService.name);

	constructor(private readonly clickhouse: ClickhouseService) {}

	async getDeliveryRates(orgId: string, filters?: AnalyticsFilters): Promise<DeliveryRateResult[]> {
		let whereClauses = 'org_id = {orgId:String}';
		const params: Record<string, string | number> = { orgId };

		if (filters?.from) {
			whereClauses += ' AND created_at >= {from:String}';
			params['from'] = filters.from;
		}
		if (filters?.to) {
			whereClauses += ' AND created_at <= {to:String}';
			params['to'] = filters.to;
		}
		if (filters?.channel) {
			whereClauses += ' AND channel = {channel:String}';
			params['channel'] = filters.channel;
		}

		const sql = `
			SELECT
				channel,
				countIf(status = 'sent') AS sent,
				countIf(status = 'delivered') AS delivered,
				countIf(status = 'failed') AS failed,
				if(countIf(status = 'sent') > 0,
					round(countIf(status = 'delivered') / countIf(status = 'sent') * 100, 2),
					0
				) AS deliveryRate
			FROM notification_events
			WHERE ${whereClauses}
			GROUP BY channel
			ORDER BY sent DESC
		`;

		const result = await this.clickhouse.query<DeliveryRateResult>(sql, params);
		return Array.isArray(result) ? result : [];
	}

	async getOpenRates(orgId: string, filters?: AnalyticsFilters): Promise<OpenRateResult[]> {
		let whereClauses = 'org_id = {orgId:String}';
		const params: Record<string, string | number> = { orgId };

		if (filters?.from) {
			whereClauses += ' AND created_at >= {from:String}';
			params['from'] = filters.from;
		}
		if (filters?.to) {
			whereClauses += ' AND created_at <= {to:String}';
			params['to'] = filters.to;
		}
		if (filters?.channel) {
			whereClauses += ' AND channel = {channel:String}';
			params['channel'] = filters.channel;
		}

		const sql = `
			SELECT
				channel,
				countIf(status = 'delivered') AS delivered,
				countIf(status = 'opened') AS opened,
				countIf(status = 'clicked') AS clicked,
				if(countIf(status = 'delivered') > 0,
					round(countIf(status = 'opened') / countIf(status = 'delivered') * 100, 2),
					0
				) AS openRate,
				if(countIf(status = 'delivered') > 0,
					round(countIf(status = 'clicked') / countIf(status = 'delivered') * 100, 2),
					0
				) AS clickRate
			FROM notification_events
			WHERE ${whereClauses}
			GROUP BY channel
			ORDER BY delivered DESC
		`;

		const result = await this.clickhouse.query<OpenRateResult>(sql, params);
		return Array.isArray(result) ? result : [];
	}

	async getTimeSeriesMetrics(
		orgId: string,
		interval: 'minute' | 'hour' | 'day',
		from: string,
		to: string,
	): Promise<TimeSeriesMetric[]> {
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
				countIf(status = 'failed') AS failed
			FROM notification_events
			WHERE org_id = {orgId:String}
				AND created_at >= {from:String}
				AND created_at <= {to:String}
			GROUP BY timestamp
			ORDER BY timestamp ASC
		`;

		const result = await this.clickhouse.query<TimeSeriesMetric>(sql, { orgId, from, to });
		return Array.isArray(result) ? result : [];
	}

	async getProviderPerformance(orgId: string): Promise<ProviderPerformanceResult[]> {
		const sql = `
			SELECT
				provider,
				channel,
				countIf(status = 'sent') AS sent,
				countIf(status = 'delivered') AS delivered,
				countIf(status = 'failed') AS failed,
				round(
					avgIf(
						if(delivered_at IS NOT NULL AND sent_at IS NOT NULL,
							dateDiff('millisecond', sent_at, delivered_at),
							0
						),
						delivered_at IS NOT NULL AND sent_at IS NOT NULL
					),
					2
				) AS avgLatencyMs
			FROM notification_events
			WHERE org_id = {orgId:String}
			GROUP BY provider, channel
			ORDER BY sent DESC
		`;

		const result = await this.clickhouse.query<ProviderPerformanceResult>(sql, { orgId });
		return Array.isArray(result) ? result : [];
	}

	async getTopTemplates(orgId: string, limit = 10): Promise<TopTemplateResult[]> {
		const sql = `
			SELECT
				template_id,
				countIf(status = 'sent') AS total_sent,
				countIf(status = 'delivered') AS total_delivered,
				countIf(status = 'failed') AS total_failed,
				if(countIf(status = 'sent') > 0,
					round(countIf(status = 'delivered') / countIf(status = 'sent') * 100, 2),
					0
				) AS deliveryRate
			FROM notification_events
			WHERE org_id = {orgId:String}
				AND template_id != ''
			GROUP BY template_id
			ORDER BY total_sent DESC
			LIMIT {limit:UInt32}
		`;

		const result = await this.clickhouse.query<TopTemplateResult>(sql, { orgId, limit });
		return Array.isArray(result) ? result : [];
	}
}
