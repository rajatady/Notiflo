import { Injectable, Logger } from '@nestjs/common';
import { HookPoint, IHook } from '../interfaces/plugin.interface';

@Injectable()
export class HookRegistryService {
  private readonly logger = new Logger(HookRegistryService.name);
  private readonly hooks = new Map<HookPoint, IHook[]>();

  register(hook: IHook): void {
    const hookPoint = hook.hookPoint;
    const existing = this.hooks.get(hookPoint) ?? [];

    const duplicate = existing.find((h) => h.name === hook.name);
    if (duplicate) {
      throw new Error(
        `Hook "${hook.name}" is already registered at hook point "${hookPoint}"`,
      );
    }

    existing.push(hook);
    this.hooks.set(hookPoint, existing);

    this.logger.log(
      `Hook "${hook.name}" registered at "${hookPoint}" with priority ${hook.priority ?? 100}`,
    );
  }

  unregister(hookPoint: HookPoint, hookName: string): void {
    const existing = this.hooks.get(hookPoint);
    if (!existing) {
      throw new Error(`No hooks registered at hook point "${hookPoint}"`);
    }

    const index = existing.findIndex((h) => h.name === hookName);
    if (index === -1) {
      throw new Error(
        `Hook "${hookName}" is not registered at hook point "${hookPoint}"`,
      );
    }

    existing.splice(index, 1);

    if (existing.length === 0) {
      this.hooks.delete(hookPoint);
    } else {
      this.hooks.set(hookPoint, existing);
    }

    this.logger.log(
      `Hook "${hookName}" unregistered from "${hookPoint}"`,
    );
  }

  getHooks(hookPoint: HookPoint): IHook[] {
    const hooks = this.hooks.get(hookPoint) ?? [];
    return [...hooks].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
    );
  }

  hasHooks(hookPoint: HookPoint): boolean {
    const hooks = this.hooks.get(hookPoint);
    return !!hooks && hooks.length > 0;
  }
}
