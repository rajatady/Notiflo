import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AlertConditionInput,
  ConditionMatchBatch,
  ConditionMatchResult,
} from './types/condition.types';
import { NormalizedTickInput } from './types/tick.types';
import { EngineMetrics } from './types/delivery.types';

/**
 * NestJS service wrapping the Rust engine-core napi addon.
 *
 * Provides a clean TypeScript API for the rest of the NestJS application
 * to interact with the Rust condition evaluation engine.
 *
 * Emits 'engine.condition.match' events when conditions match,
 * bridging the Rust ThreadsafeFunction callback to NestJS EventEmitter.
 */
@Injectable()
export class EngineBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngineBridgeService.name);
  private engine: any;
  private initialized = false;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    try {
      // engine-core is externalized in webpack.config.js so this require
      // passes through to Node.js at runtime (not bundled by webpack).
      // tsconfig paths map 'engine-core' → libs/engine/engine-core/index.js
      // which loads the platform-specific .node native addon.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.engine = require('engine-core');
      this.logger.log('Loaded engine-core native addon');

      // Initialize the engine
      this.engine.initEngine();
      this.initialized = true;
      this.logger.log('Rust condition engine initialized');

      // Register the match callback — bridges Rust → Node.js EventEmitter.
      // ErrorStrategy::Fatal means callback receives (data) not (err, data).
      this.engine.onConditionMatch((matchesJson: string) => {
        try {
          const batch: ConditionMatchBatch = JSON.parse(matchesJson);
          this.eventEmitter.emit('engine.condition.match', batch);
          this.logger.debug(`Emitted match batch: ${batch.matches.length} matches`);
        } catch (e) {
          this.logger.error('Failed to parse match batch', e);
        }
      });

      this.logger.log('Engine match callback registered');
    } catch (error) {
      this.logger.warn(
        'Failed to load engine-core native addon. Rust engine will be unavailable.',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async onModuleDestroy() {
    this.logger.log('Engine bridge shutting down');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Add a condition to the Rust evaluation engine.
   */
  addCondition(condition: AlertConditionInput): string {
    this.ensureInitialized();
    return this.engine.addCondition(condition);
  }

  /**
   * Remove a condition by ID.
   */
  removeCondition(conditionId: string): boolean {
    this.ensureInitialized();
    return this.engine.removeCondition(conditionId);
  }

  /**
   * Update a condition (replaces existing with same ID).
   */
  updateCondition(condition: AlertConditionInput): boolean {
    this.ensureInitialized();
    return this.engine.updateCondition(condition);
  }

  /**
   * Bulk load conditions (e.g., on startup from MongoDB).
   */
  bulkLoadConditions(conditions: AlertConditionInput[]): number {
    this.ensureInitialized();
    return this.engine.bulkLoadConditions(conditions);
  }

  /**
   * Get total condition count across all strategies.
   */
  getConditionCount(): number {
    this.ensureInitialized();
    return this.engine.getConditionCount();
  }

  /**
   * Evaluate a single tick synchronously. For testing/debugging.
   */
  evaluateTick(tick: NormalizedTickInput): ConditionMatchResult[] {
    this.ensureInitialized();
    return this.engine.evaluateTick(tick);
  }

  /**
   * Get engine metrics (ticks/sec, matches/sec, avg latency, per-strategy counts).
   */
  getMetrics(): EngineMetrics {
    this.ensureInitialized();
    return this.engine.getEngineMetrics();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Rust engine not initialized. Check that engine-core native addon is built and loadable.',
      );
    }
  }
}
