import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignStatus, CampaignSchedule } from '../core/types/campaign.types';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(@Body() createCampaignDto: CreateCampaignDto) {
    return this.campaignsService.create(createCampaignDto);
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId: string,
    @Query('status') status?: CampaignStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.campaignsService.findAll(organizationId, status, limit, offset);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCampaignDto: UpdateCampaignDto) {
    return this.campaignsService.update(id, updateCampaignDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }

  @Post(':id/submit')
  submitForApproval(@Param('id') id: string) {
    return this.campaignsService.submitForApproval(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { approvedBy: string }) {
    return this.campaignsService.approve(id, body.approvedBy);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { rejectedBy: string; reason: string },
  ) {
    return this.campaignsService.reject(id, body.rejectedBy, body.reason);
  }

  @Post(':id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() body: { schedule: CampaignSchedule },
  ) {
    return this.campaignsService.schedule(id, body.schedule);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.campaignsService.start(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaignsService.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.campaignsService.resume(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.campaignsService.cancel(id);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string) {
    return this.campaignsService.getAnalytics(id);
  }
}
