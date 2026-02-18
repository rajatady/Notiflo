import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ClickHouseClient, ResponseJSON } from '@clickhouse/client';
import { CLICKHOUSE_CLIENT } from './clickhouse.module';

export interface NotificationEvent {
	event_id: string;
	org_id: string;
	subscriber_id: string;
	channel: string;
	provider: string;
	status: string;
	campaign_id?: string;
	workflow_id?: string;
	template_id?: string;
	created_at: string;
	sent_at?: string;
	delivered_at?: string;
	error?: string;
	metadata?: string; // JSON string
}

export interface CampaignAnalyticsRow {
	campaign_id: string;
	org_id: string;
	channel: string;
	total_sent: number;
	total_delivered: number;
	total_failed: number;
	total_opened: number;
	total_clicked: number;
	total_bounced: number;
	updated_at: string;
}

export interface EventLogRow {
	event_id: string;
	org_id: string;
	event_name: string;
	subscriber_id: string;
	source: string;
	payload?: string; // JSON string
	created_at: string;
}

@Injectable()
export class ClickhouseService implements OnModuleDestroy {
	private readonly logger = new Logger(ClickhouseService.name);

	constructor(
		@Inject(CLICKHOUSE_CLIENT)
		private readonly client: ClickHouseClient,
	) {}

	async ensureTables(): Promise<void> {
		this.logger.log('Ensuring ClickHouse analytics tables exist...');

		await this.client.command({
			query: `
				CREATE TABLE IF NOT EXISTS notification_events (
					event_id String,
					org_id String,
					subscriber_id String,
					channel String,
					provider String,
					status String,
					campaign_id String DEFAULT '',
					workflow_id String DEFAULT '',
					template_id String DEFAULT '',
					created_at DateTime64(3),
					sent_at Nullable(DateTime64(3)),
					delivered_at Nullable(DateTime64(3)),
					error String DEFAULT '',
					metadata String DEFAULT '{}'
				) ENGINE = MergeTree()
				ORDER BY (org_id, created_at, channel)
			`,
		});

		await this.client.command({
			query: `
				CREATE TABLE IF NOT EXISTS campaign_analytics (
					campaign_id String,
					org_id String,
					channel String,
					total_sent UInt64 DEFAULT 0,
					total_delivered UInt64 DEFAULT 0,
					total_failed UInt64 DEFAULT 0,
					total_opened UInt64 DEFAULT 0,
					total_clicked UInt64 DEFAULT 0,
					total_bounced UInt64 DEFAULT 0,
					updated_at DateTime64(3)
				) ENGINE = ReplacingMergeTree(updated_at)
				ORDER BY (campaign_id, channel)
			`,
		});

		await this.client.command({
			query: `
				CREATE TABLE IF NOT EXISTS event_log (
					event_id String,
					org_id String,
					event_name String,
					subscriber_id String,
					source String,
					payload String DEFAULT '{}',
					created_at DateTime64(3)
				) ENGINE = MergeTree()
				ORDER BY (org_id, created_at, event_name)
			`,
		});

		this.logger.log('ClickHouse analytics tables ensured.');
	}

	async insertNotificationEvents(events: NotificationEvent[]): Promise<void> {
		if (events.length === 0) return;

		await this.client.insert({
			table: 'notification_events',
			values: events.map((e) => ({
				event_id: e.event_id,
				org_id: e.org_id,
				subscriber_id: e.subscriber_id,
				channel: e.channel,
				provider: e.provider,
				status: e.status,
				campaign_id: e.campaign_id ?? '',
				workflow_id: e.workflow_id ?? '',
				template_id: e.template_id ?? '',
				created_at: e.created_at,
				sent_at: e.sent_at ?? null,
				delivered_at: e.delivered_at ?? null,
				error: e.error ?? '',
				metadata: e.metadata ?? '{}',
			})),
			format: 'JSONEachRow',
		});
	}

	async insertEventLogs(events: EventLogRow[]): Promise<void> {
		if (events.length === 0) return;

		await this.client.insert({
			table: 'event_log',
			values: events.map((e) => ({
				event_id: e.event_id,
				org_id: e.org_id,
				event_name: e.event_name,
				subscriber_id: e.subscriber_id,
				source: e.source,
				payload: e.payload ?? '{}',
				created_at: e.created_at,
			})),
			format: 'JSONEachRow',
		});
	}

	async upsertCampaignAnalytics(analytics: CampaignAnalyticsRow[]): Promise<void> {
		if (analytics.length === 0) return;

		await this.client.insert({
			table: 'campaign_analytics',
			values: analytics.map((a) => ({
				campaign_id: a.campaign_id,
				org_id: a.org_id,
				channel: a.channel,
				total_sent: a.total_sent,
				total_delivered: a.total_delivered,
				total_failed: a.total_failed,
				total_opened: a.total_opened,
				total_clicked: a.total_clicked,
				total_bounced: a.total_bounced,
				updated_at: a.updated_at,
			})),
			format: 'JSONEachRow',
		});
	}

	async query<T = Record<string, unknown>>(
		sql: string,
		params?: Record<string, string | number>,
	): Promise<ResponseJSON<T>> {
		const result = await this.client.query({
			query: sql,
			query_params: params,
			format: 'JSONEachRow',
		});
		return result.json<T>();
	}

	async onModuleDestroy(): Promise<void> {
		await this.close();
	}

	async close(): Promise<void> {
		this.logger.log('Closing ClickHouse client connection...');
		await this.client.close();
	}
}
