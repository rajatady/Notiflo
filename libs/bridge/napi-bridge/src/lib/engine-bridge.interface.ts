import {
  AlertConditionInput,
  ConditionMatchResult,
} from './types/condition.types';
import { NormalizedTickInput } from './types/tick.types';
import { EngineMetrics } from './types/delivery.types';

/**
 * DI token for the engine bridge service.
 * Use with @Inject(ENGINE_BRIDGE) and @Optional() for graceful degradation.
 */
export const ENGINE_BRIDGE = 'ENGINE_BRIDGE';

/**
 * Interface for the engine bridge — abstracts the Rust napi addon
 * so that a mock can be used in tests without compiling Rust.
 */
export interface IEngineBridge {
  isInitialized(): boolean;
  addCondition(condition: AlertConditionInput): string;
  removeCondition(conditionId: string): boolean;
  updateCondition(condition: AlertConditionInput): boolean;
  bulkLoadConditions(conditions: AlertConditionInput[]): number;
  getConditionCount(): number;
  evaluateTick(tick: NormalizedTickInput): ConditionMatchResult[];
  getMetrics(): EngineMetrics;
}
