import { Injectable } from '@nestjs/common';
import { NotificationAnalyticsService, AnalyticsFilters } from './queries/notification-analytics.service';
import { CampaignPerformanceService } from './queries/campaign-performance.service';
import { AiVisibilityService, StructuredQuery } from './ai/ai-visibility.service';

export interface AnalyticsOverview {
	deliveryRates: Awaited<ReturnType<NotificationAnalyticsService['getDeliveryRates']>>;
	openRates: Awaited<ReturnType<NotificationAnalyticsService['getOpenRates']>>;
	providerPerformance: Awaited<ReturnType<NotificationAnalyticsService['getProviderPerformance']>>;
	topTemplates: Awaited<ReturnType<NotificationAnalyticsService['getTopTemplates']>>;
	activeCampaigns: Awaited<ReturnType<CampaignPerformanceService['getActiveCampaignProgress']>>;
	anomalies: Awaited<ReturnType<AiVisibilityService['anomalyReport']>>;
}

@Injectable()
export class AnalyticsAnalyticsService {
	constructor(
		private readonly notificationAnalytics: NotificationAnalyticsService,
		private readonly campaignPerformance: CampaignPerformanceService,
		private readonly aiVisibility: AiVisibilityService,
	) {}

	async getOverview(orgId: string, filters?: AnalyticsFilters): Promise<AnalyticsOverview> {
		const [deliveryRates, openRates, providerPerformance, topTemplates, activeCampaigns, anomalies] =
			await Promise.all([
				this.notificationAnalytics.getDeliveryRates(orgId, filters),
				this.notificationAnalytics.getOpenRates(orgId, filters),
				this.notificationAnalytics.getProviderPerformance(orgId),
				this.notificationAnalytics.getTopTemplates(orgId),
				this.campaignPerformance.getActiveCampaignProgress(orgId),
				this.aiVisibility.anomalyReport(orgId),
			]);

		return {
			deliveryRates,
			openRates,
			providerPerformance,
			topTemplates,
			activeCampaigns,
			anomalies,
		};
	}

	async query(orgId: string, type: string, params: Record<string, unknown> = {}): Promise<unknown> {
		return this.aiVisibility.queryAnalytics(orgId, {
			type: type as StructuredQuery['type'],
			params,
		});
	}
}
