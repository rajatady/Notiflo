import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { SubmitTickDto } from './dto/submit-tick.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  create(@Body() createAlertDto: CreateAlertDto) {
    return this.alertsService.create(createAlertDto);
  }

  @Post('ticks')
  @HttpCode(HttpStatus.OK)
  submitTick(@Body() tick: SubmitTickDto) {
    if (!this.alertsService.isEngineAvailable()) {
      throw new ServiceUnavailableException('Engine not initialized');
    }
    const start = process.hrtime.bigint();
    const matches = this.alertsService.evaluateTick(tick);
    const elapsed = process.hrtime.bigint() - start;
    const engineTimeUs = Number(elapsed) / 1000;
    return {
      matches,
      count: matches.length,
      engineTimeUs: Math.round(engineTimeUs * 100) / 100,
      conditionsEvaluated: this.alertsService.getEngineConditionCount(),
    };
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.alertsService.findAll(organizationId, limit, offset);
  }

  @Get('metrics')
  getMetrics() {
    return this.alertsService.getEngineMetrics();
  }

  @Get('count')
  getEngineCount() {
    return { count: this.alertsService.getEngineConditionCount() };
  }

  @Get('by-symbol')
  findBySymbol(
    @Query('organizationId') organizationId: string,
    @Query('symbol') symbol: string,
  ) {
    return this.alertsService.findBySymbol(organizationId, symbol);
  }

  @Get('by-subscriber')
  findBySubscriber(
    @Query('organizationId') organizationId: string,
    @Query('subscriberId') subscriberId: string,
  ) {
    return this.alertsService.findBySubscriber(organizationId, subscriberId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAlertDto: UpdateAlertDto) {
    return this.alertsService.update(id, updateAlertDto);
  }

  @Patch(':id/toggle')
  toggleActive(
    @Param('id') id: string,
    @Body('active') active: boolean,
  ) {
    return this.alertsService.toggleActive(id, active);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alertsService.remove(id);
  }
}
