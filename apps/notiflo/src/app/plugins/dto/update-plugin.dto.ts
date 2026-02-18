import { PartialType } from '@nestjs/swagger';
import { CreatePluginDto } from './create-plugin.dto';

export class UpdatePluginDto extends PartialType(CreatePluginDto) {}
