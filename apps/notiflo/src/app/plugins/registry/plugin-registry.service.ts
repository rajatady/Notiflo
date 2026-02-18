import { Injectable, Logger } from '@nestjs/common';
import {
  IPlugin,
  ICustomChannelPlugin,
} from '../interfaces/plugin.interface';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly plugins = new Map<string, IPlugin>();

  async register(plugin: IPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    this.logger.log(
      `Registering plugin "${plugin.name}" v${plugin.version}`,
    );

    await plugin.initialize();
    this.plugins.set(plugin.name, plugin);

    this.logger.log(`Plugin "${plugin.name}" registered successfully`);
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not registered`);
    }

    this.logger.log(`Unregistering plugin "${name}"`);

    await plugin.destroy();
    this.plugins.delete(name);

    this.logger.log(`Plugin "${name}" unregistered successfully`);
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  getCustomChannelPlugins(): ICustomChannelPlugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin): plugin is ICustomChannelPlugin =>
        'channel' in plugin && 'getProvider' in plugin,
    );
  }
}
