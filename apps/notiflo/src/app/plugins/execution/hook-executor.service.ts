import { Injectable, Logger } from '@nestjs/common';
import { HookRegistryService } from '../registry/hook-registry.service';
import {
  HookPoint,
  HookContext,
  HookResult,
  IHook,
} from '../interfaces/plugin.interface';

export interface HookExecutionOptions {
  timeoutMs?: number;
  continueOnError?: boolean;
}

@Injectable()
export class HookExecutorService {
  private readonly logger = new Logger(HookExecutorService.name);

  constructor(private readonly hookRegistry: HookRegistryService) {}

  async executeHooks(
    hookPoint: HookPoint,
    context: HookContext,
    options?: HookExecutionOptions,
  ): Promise<HookResult> {
    const timeoutMs = options?.timeoutMs ?? 5000;
    const continueOnError = options?.continueOnError ?? true;

    const hooks = this.hookRegistry.getHooks(hookPoint);

    if (hooks.length === 0) {
      return { modified: false, data: context.data };
    }

    let currentData = { ...context.data };
    let anyModified = false;
    let totalExecutionTimeMs = 0;

    for (const hook of hooks) {
      const hookContext: HookContext = {
        ...context,
        data: currentData,
      };

      try {
        const result = await this.executeWithTimeout(
          hook,
          hookContext,
          timeoutMs,
        );

        totalExecutionTimeMs += result.executionTimeMs ?? 0;

        if (result.error) {
          this.logger.warn(
            `Hook "${hook.name}" at "${hookPoint}" returned error: ${result.error}`,
          );

          if (!continueOnError) {
            return {
              modified: anyModified,
              data: currentData,
              error: `Hook "${hook.name}" failed: ${result.error}`,
              executionTimeMs: totalExecutionTimeMs,
            };
          }

          continue;
        }

        if (result.modified && result.data) {
          currentData = { ...currentData, ...result.data };
          anyModified = true;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.error(
          `Hook "${hook.name}" at "${hookPoint}" threw: ${errorMessage}`,
        );

        if (!continueOnError) {
          return {
            modified: anyModified,
            data: currentData,
            error: `Hook "${hook.name}" threw: ${errorMessage}`,
            executionTimeMs: totalExecutionTimeMs,
          };
        }
      }
    }

    return {
      modified: anyModified,
      data: currentData,
      executionTimeMs: totalExecutionTimeMs,
    };
  }

  private async executeWithTimeout(
    hook: IHook,
    context: HookContext,
    timeoutMs: number,
  ): Promise<HookResult> {
    const startTime = Date.now();

    const resultPromise = hook.execute(context);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Hook "${hook.name}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const executionTimeMs = Date.now() - startTime;

    return {
      ...result,
      executionTimeMs,
    };
  }
}
