import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreatePluginDto } from './dto/create-plugin.dto';
import { PluginRegistryService } from './registry/plugin-registry.service';
import { HookRegistryService } from './registry/hook-registry.service';
import {
  IPlugin,
  IHook,
  HookPoint,
  HookContext,
  HookResult,
} from './interfaces/plugin.interface';

/**
 * A simple plugin implementation created from DTO configuration.
 * For production use, plugins would typically be loaded from npm packages or
 * external sources. This serves as the default wrapper.
 */
class ConfigPlugin implements IPlugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly type: string;
  readonly config: Record<string, unknown>;

  constructor(dto: CreatePluginDto) {
    this.name = dto.name;
    this.version = dto.version;
    this.description = dto.description;
    this.type = dto.type;
    this.config = dto.config ?? {};
  }

  async initialize(): Promise<void> {
    // Config-based plugins are initialized immediately
  }

  async destroy(): Promise<void> {
    // Cleanup if needed
  }
}

/**
 * A simple hook implementation created from inline handler configuration.
 */
class ConfigHook implements IHook {
  readonly name: string;
  readonly hookPoint: HookPoint;
  readonly priority: number;
  private readonly handlerCode?: string;

  constructor(
    pluginName: string,
    hookDef: { hookPoint: string; priority?: number; handlerCode?: string },
  ) {
    this.name = `${pluginName}:${hookDef.hookPoint}`;
    this.hookPoint = hookDef.hookPoint as HookPoint;
    this.priority = hookDef.priority ?? 100;
    this.handlerCode = hookDef.handlerCode;
  }

  async execute(context: HookContext): Promise<HookResult> {
    // If handlerCode is provided, it can be evaluated in a sandboxed context
    // For now, this is a pass-through that marks the data as unmodified
    if (this.handlerCode) {
      try {
        const handler = new Function('context', this.handlerCode);
        const result = handler(context);
        return {
          modified: true,
          data: result?.data ?? context.data,
        };
      } catch (error) {
        return {
          modified: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { modified: false, data: context.data };
  }
}

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name);

  /** Track which hooks belong to which plugin for cleanup */
  private readonly pluginHooks = new Map<string, IHook[]>();

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly hookRegistry: HookRegistryService,
  ) {}

  async create(dto: CreatePluginDto): Promise<{
    name: string;
    version: string;
    type: string;
    hooksRegistered: number;
  }> {
    const plugin = new ConfigPlugin(dto);
    await this.pluginRegistry.register(plugin);

    const registeredHooks: IHook[] = [];

    // Register any hooks defined in the DTO
    if (dto.hooks && dto.hooks.length > 0) {
      for (const hookDef of dto.hooks) {
        const hook = new ConfigHook(dto.name, hookDef);
        this.hookRegistry.register(hook);
        registeredHooks.push(hook);
      }
    }

    this.pluginHooks.set(dto.name, registeredHooks);

    this.logger.log(
      `Plugin "${dto.name}" created with ${registeredHooks.length} hook(s)`,
    );

    return {
      name: dto.name,
      version: dto.version,
      type: dto.type,
      hooksRegistered: registeredHooks.length,
    };
  }

  findAll(): Array<{
    name: string;
    version: string;
    description?: string;
    hooks: string[];
  }> {
    const plugins = this.pluginRegistry.getAllPlugins();

    return plugins.map((plugin) => {
      const hooks = this.pluginHooks.get(plugin.name) ?? [];
      return {
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        hooks: hooks.map((h) => `${h.hookPoint} (priority: ${h.priority ?? 100})`),
      };
    });
  }

  findOne(name: string): {
    name: string;
    version: string;
    description?: string;
    hooks: Array<{ name: string; hookPoint: string; priority: number }>;
  } {
    const plugin = this.pluginRegistry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }

    const hooks = (this.pluginHooks.get(name) ?? []).map((h) => ({
      name: h.name,
      hookPoint: h.hookPoint,
      priority: h.priority ?? 100,
    }));

    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      hooks,
    };
  }

  async remove(name: string): Promise<{ removed: boolean }> {
    const plugin = this.pluginRegistry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${name}" not found`);
    }

    // Unregister all hooks belonging to this plugin
    const hooks = this.pluginHooks.get(name) ?? [];
    for (const hook of hooks) {
      try {
        this.hookRegistry.unregister(hook.hookPoint, hook.name);
      } catch {
        // Hook may have already been manually unregistered
      }
    }
    this.pluginHooks.delete(name);

    // Unregister the plugin itself
    await this.pluginRegistry.unregister(name);

    return { removed: true };
  }

  registerHookForPlugin(
    pluginName: string,
    hookDef: { hookPoint: string; priority?: number; handlerCode?: string },
  ): { hookName: string; hookPoint: string; priority: number } {
    const plugin = this.pluginRegistry.getPlugin(pluginName);
    if (!plugin) {
      throw new NotFoundException(`Plugin "${pluginName}" not found`);
    }

    const hook = new ConfigHook(pluginName, hookDef);
    this.hookRegistry.register(hook);

    const existing = this.pluginHooks.get(pluginName) ?? [];
    existing.push(hook);
    this.pluginHooks.set(pluginName, existing);

    return {
      hookName: hook.name,
      hookPoint: hook.hookPoint,
      priority: hook.priority,
    };
  }

  getHooksForPoint(hookPoint: HookPoint): Array<{
    name: string;
    hookPoint: string;
    priority: number;
  }> {
    return this.hookRegistry.getHooks(hookPoint).map((hook) => ({
      name: hook.name,
      hookPoint: hook.hookPoint,
      priority: hook.priority ?? 100,
    }));
  }
}
