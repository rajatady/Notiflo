import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import {
  DashboardFiltersDto,
  DashboardOverview,
  ChannelHealth,
  ActiveCampaignSummary,
  TimelinePoint,
  ProviderHealth,
} from './dto/dashboard.dto';

/**
 * Dashboard controller providing aggregated metrics and health endpoints.
 *
 * All endpoints require an organizationId. In a production setup this would
 * come from a JWT / auth guard; for now it is accepted as a query parameter.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview(
    @Query() filters: DashboardFiltersDto,
    @Query('orgId') orgId: string,
  ): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(orgId, filters);
  }

  @Get('channels')
  async getChannelHealth(
    @Query('orgId') orgId: string,
  ): Promise<ChannelHealth[]> {
    return this.dashboardService.getChannelHealth(orgId);
  }

  @Get('campaigns/active')
  async getActiveCampaigns(
    @Query('orgId') orgId: string,
  ): Promise<ActiveCampaignSummary[]> {
    return this.dashboardService.getActiveCampaigns(orgId);
  }

  @Get('timeline')
  async getTimeline(
    @Query() filters: DashboardFiltersDto,
    @Query('orgId') orgId: string,
  ): Promise<TimelinePoint[]> {
    return this.dashboardService.getTimeline(orgId, filters);
  }

  @Get('providers')
  async getProviderHealth(
    @Query('orgId') orgId: string,
  ): Promise<ProviderHealth[]> {
    return this.dashboardService.getProviderHealth(orgId);
  }

  @Get('subscribers/growth')
  async getSubscriberGrowth(
    @Query() filters: DashboardFiltersDto,
    @Query('orgId') orgId: string,
  ): Promise<{ date: string; count: number }[]> {
    return this.dashboardService.getSubscriberGrowth(orgId, filters);
  }

  @Get('workflows/active')
  async getActiveWorkflows(
    @Query('orgId') orgId: string,
  ): Promise<any[]> {
    return this.dashboardService.getActiveWorkflows(orgId);
  }

  @Get('engine')
  getEngineStatus(): Record<string, unknown> {
    return this.dashboardService.getEngineStatus();
  }
}
