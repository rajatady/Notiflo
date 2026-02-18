// Main module and facade service
export { AnalyticsAnalyticsModule } from './lib/analytics-analytics.module';
export { AnalyticsAnalyticsService, AnalyticsOverview } from './lib/analytics-analytics.service';

// ClickHouse infrastructure
export { ClickhouseModule, ClickHouseModuleOptions, ClickHouseModuleAsyncOptions, CLICKHOUSE_CLIENT } from './lib/clickhouse/clickhouse.module';
export { ClickhouseService, NotificationEvent, CampaignAnalyticsRow, EventLogRow } from './lib/clickhouse/clickhouse.service';

// Query services
export {
	NotificationAnalyticsService,
	AnalyticsFilters,
	DeliveryRateResult,
	OpenRateResult,
	TimeSeriesMetric,
	ProviderPerformanceResult,
	TopTemplateResult,
} from './lib/queries/notification-analytics.service';
export {
	CampaignPerformanceService,
	CampaignMetrics,
	CampaignChannelBreakdown,
	CampaignTimelinePoint,
	CampaignComparison,
	CampaignRanking,
	ActiveCampaignProgress,
} from './lib/queries/campaign-performance.service';

// AI visibility service
export {
	AiVisibilityService,
	NotificationTrace,
	SubscriberJourneyEntry,
	AnomalyReport,
	CrossChannelCorrelation,
	FunnelStep,
	StructuredQuery,
} from './lib/ai/ai-visibility.service';
