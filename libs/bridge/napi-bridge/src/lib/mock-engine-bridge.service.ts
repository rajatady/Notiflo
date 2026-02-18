import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AlertConditionInput,
  ConditionMatchResult,
  ConditionMatchBatch,
} from './types/condition.types';
import { NormalizedTickInput } from './types/tick.types';
import { EngineMetrics } from './types/delivery.types';
import { IEngineBridge } from './engine-bridge.interface';

/**
 * Mock implementation of the engine bridge for testing.
 * Evaluates threshold_crossing and expression conditions in pure JS.
 * No Rust addon required.
 */
@Injectable()
export class MockEngineBridgeService implements IEngineBridge {
  private readonly logger = new Logger(MockEngineBridgeService.name);
  private readonly conditions = new Map<string, AlertConditionInput>();
  private totalTicksProcessed = 0;
  private totalMatches = 0;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  isInitialized(): boolean {
    return true;
  }

  addCondition(condition: AlertConditionInput): string {
    this.conditions.set(condition.id, condition);
    return condition.id;
  }

  removeCondition(conditionId: string): boolean {
    return this.conditions.delete(conditionId);
  }

  updateCondition(condition: AlertConditionInput): boolean {
    if (!this.conditions.has(condition.id)) {
      return false;
    }
    this.conditions.set(condition.id, condition);
    return true;
  }

  bulkLoadConditions(conditions: AlertConditionInput[]): number {
    let loaded = 0;
    for (const c of conditions) {
      if (c.active) {
        this.conditions.set(c.id, c);
        loaded++;
      }
    }
    return loaded;
  }

  getConditionCount(): number {
    return this.conditions.size;
  }

  evaluateTick(tick: NormalizedTickInput): ConditionMatchResult[] {
    this.totalTicksProcessed++;
    const matches: ConditionMatchResult[] = [];

    for (const condition of this.conditions.values()) {
      if (condition.symbol !== tick.symbol) continue;
      if (!condition.active) continue;

      const matched = this.evaluateCondition(condition, tick);
      if (matched) {
        const match: ConditionMatchResult = {
          conditionId: condition.id,
          organizationId: condition.organizationId,
          subscriberId: condition.subscriberId,
          symbol: tick.symbol,
          matchedValue: tick.value,
          channels: condition.channels,
          templateId: condition.templateId,
          timestampUs: tick.timestampUs,
          matchDetail: `Mock match: ${condition.strategyType}`,
        };
        matches.push(match);
      }
    }

    this.totalMatches += matches.length;

    // Emit match event if there are matches (mirrors Rust ThreadsafeFunction behavior)
    if (matches.length > 0) {
      const batch: ConditionMatchBatch = {
        matches,
        batch_timestamp_us: tick.timestampUs,
      };
      this.eventEmitter.emit('engine.condition.match', batch);
    }

    return matches;
  }

  getMetrics(): EngineMetrics {
    return {
      totalConditions: this.conditions.size,
      totalTicksProcessed: this.totalTicksProcessed,
      totalMatches: this.totalMatches,
      ticksPerSecond: 0,
      matchesPerSecond: 0,
      avgEvaluationUs: 0,
      strategies: [],
    };
  }

  private evaluateCondition(
    condition: AlertConditionInput,
    tick: NormalizedTickInput,
  ): boolean {
    try {
      const params = JSON.parse(condition.strategyParams);

      switch (condition.strategyType) {
        case 'threshold_crossing':
          return this.evaluateThreshold(params, tick);
        case 'expression':
          return this.evaluateExpression(params, tick);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private evaluateThreshold(
    params: { threshold: number; operator: string },
    tick: NormalizedTickInput,
  ): boolean {
    const { threshold, operator } = params;
    const value = tick.value;

    switch (operator) {
      case 'greater_than':
      case 'cross_above':
        return value > threshold;
      case 'less_than':
      case 'cross_below':
        return value < threshold;
      case 'greater_than_or_equal':
        return value >= threshold;
      case 'less_than_or_equal':
        return value <= threshold;
      case 'equal':
        return value === threshold;
      case 'not_equal':
        return value !== threshold;
      default:
        return false;
    }
  }

  private evaluateExpression(
    params: { expression: string },
    tick: NormalizedTickInput,
  ): boolean {
    // Simple expression evaluation for testing
    const expr = params.expression;
    const value = tick.value;
    const volume = tick.secondaryValue ?? 0;

    // Handle simple comparisons like "value > 150"
    const simpleMatch = expr.match(
      /^(value|price)\s*(>|>=|<|<=|==|!=)\s*([\d.]+)$/,
    );
    if (simpleMatch) {
      const num = parseFloat(simpleMatch[3]);
      switch (simpleMatch[2]) {
        case '>':
          return value > num;
        case '>=':
          return value >= num;
        case '<':
          return value < num;
        case '<=':
          return value <= num;
        case '==':
          return value === num;
        case '!=':
          return value !== num;
      }
    }

    // Handle AND expressions like "value > 150 AND volume > 1000000"
    if (expr.includes(' AND ')) {
      const parts = expr.split(' AND ').map((p) => p.trim());
      return parts.every((part) =>
        this.evaluateExpression({ expression: part }, tick),
      );
    }

    // Handle volume comparisons
    const volumeMatch = expr.match(
      /^(secondary_value|volume)\s*(>|>=|<|<=|==|!=)\s*([\d.]+)$/,
    );
    if (volumeMatch) {
      const num = parseFloat(volumeMatch[3]);
      switch (volumeMatch[2]) {
        case '>':
          return volume > num;
        case '>=':
          return volume >= num;
        case '<':
          return volume < num;
        case '<=':
          return volume <= num;
        case '==':
          return volume === num;
        case '!=':
          return volume !== num;
      }
    }

    return false;
  }
}
