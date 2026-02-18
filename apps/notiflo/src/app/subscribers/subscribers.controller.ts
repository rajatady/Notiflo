import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { SubscribersService, SegmentFilter } from './subscribers.service';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { ChannelPreference } from './schemas/subscriber.schema';

@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post()
  create(@Body() createSubscriberDto: CreateSubscriberDto) {
    return this.subscribersService.create(createSubscriberDto);
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.subscribersService.findAll(organizationId, limit, offset);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscribersService.findOne(id);
  }

  @Get('external/:externalId')
  findByExternalId(
    @Param('externalId') externalId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return this.subscribersService.findByExternalId(
      organizationId,
      externalId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSubscriberDto: UpdateSubscriberDto,
  ) {
    return this.subscribersService.update(id, updateSubscriberDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subscribersService.remove(id);
  }

  @Patch(':id/preferences')
  updatePreferences(
    @Param('id') id: string,
    @Body() preferences: Record<string, ChannelPreference>,
  ) {
    return this.subscribersService.updatePreferences(id, preferences);
  }

  @Post('segment')
  findBySegment(
    @Body()
    body: {
      organizationId: string;
      filters: SegmentFilter[];
    },
  ) {
    return this.subscribersService.findBySegment(
      body.organizationId,
      body.filters,
    );
  }
}
