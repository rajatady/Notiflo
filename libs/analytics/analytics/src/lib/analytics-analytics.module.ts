import { Module } from '@nestjs/common';
import { AnalyticsAnalyticsService } from './analytics-analytics.service';
import { ClickhouseModule } from './clickhouse/clickhouse.module';
import { NotificationAnalyticsService } from './queries/notification-analytics.service';
import { CampaignPerformanceService } from './queries/campaign-performance.service';
import { AiVisibilityService } from './ai/ai-visibility.service';

@Module({
	imports: [ClickhouseModule.forRoot()],
	providers: [
		AnalyticsAnalyticsService,
		NotificationAnalyticsService,
		CampaignPerformanceService,
		AiVisibilityService,
	],
	exports: [
		AnalyticsAnalyticsService,
		NotificationAnalyticsService,
		CampaignPerformanceService,
		AiVisibilityService,
	],
})
export class AnalyticsAnalyticsModule {}
