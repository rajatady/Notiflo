import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
} from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { CreatePluginDto } from './dto/create-plugin.dto';
import { HookPoint } from './interfaces/plugin.interface';

@Controller('plugins')
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Post()
  create(@Body() createPluginDto: CreatePluginDto) {
    return this.pluginsService.create(createPluginDto);
  }

  @Get()
  findAll() {
    return this.pluginsService.findAll();
  }

  @Get(':name')
  findOne(@Param('name') name: string) {
    return this.pluginsService.findOne(name);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.pluginsService.remove(name);
  }

  @Post(':name/hooks')
  registerHook(
    @Param('name') name: string,
    @Body() hookDef: { hookPoint: string; priority?: number; handlerCode?: string },
  ) {
    return this.pluginsService.registerHookForPlugin(name, hookDef);
  }
}

@Controller('hooks')
export class HooksController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get(':hookPoint')
  getHooksForPoint(@Param('hookPoint') hookPoint: string) {
    return this.pluginsService.getHooksForPoint(hookPoint as HookPoint);
  }
}
