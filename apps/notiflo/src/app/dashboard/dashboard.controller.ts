import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import {
  DashboardFiltersDto,
  DashboardOverview,
  ChannelHealth,
  TimelinePoint,
  ProviderHealth,
} from './dto/dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview(
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(filters.orgId, filters);
  }

  @Get('channels')
  async getChannelHealth(
    @Query() filters: DashboardFiltersDto,
  ): Promise<ChannelHealth[]> {
    return this.dashboardService.getChannelHealth(filters.orgId);
  }

  @Get('timeline')
  async getTimeline(
    @Query() filters: DashboardFiltersDto,
  ): Promise<TimelinePoint[]> {
    return this.dashboardService.getTimeline(filters.orgId, filters);
  }

  @Get('providers')
  async getProviderHealth(
    @Query() filters: DashboardFiltersDto,
  ): Promise<ProviderHealth[]> {
    return this.dashboardService.getProviderHealth(filters.orgId);
  }

  @Get('subscribers/growth')
  async getSubscriberGrowth(
    @Query() filters: DashboardFiltersDto,
  ): Promise<{ date: string; count: number }[]> {
    return this.dashboardService.getSubscriberGrowth(filters.orgId, filters);
  }

  @Get('engine')
  getEngineStatus(): Record<string, unknown> {
    return this.dashboardService.getEngineStatus();
  }
}
