import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { NotificationQuery, NotificationStatus, Channel } from '../core';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('stats')
  async getStats(@Query('organizationId') organizationId: string) {
    return this.notificationsService.getStats(organizationId);
  }

  @Get()
  async findAll(
    @Query('organizationId') organizationId: string,
    @Query('subscriberId') subscriberId?: string,
    @Query('channel') channel?: Channel,
    @Query('status') status?: NotificationStatus,
    @Query('campaignId') campaignId?: string,
    @Query('workflowId') workflowId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const query: NotificationQuery = {
      organizationId,
      subscriberId,
      channel,
      status,
      campaignId,
      workflowId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    return this.notificationsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const notification = await this.notificationsService.findOne(id);
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const notification = await this.notificationsService.updateStatus(
      id,
      dto.status,
    );
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }
}
