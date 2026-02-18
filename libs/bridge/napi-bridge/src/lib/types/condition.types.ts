/**
 * Mirrors Rust AlertConditionJs — the JS-facing condition shape.
 */
export interface AlertConditionInput {
  id: string;
  organizationId: string;
  subscriberId: string;
  symbol: string;
  /** Which evaluation strategy handles this: 'threshold_crossing' | 'expression' | 'script' */
  strategyType: string;
  /** JSON string of strategy-specific params */
  strategyParams: string;
  channels: string[];
  templateId?: string;
  active: boolean;
  cooldownMs?: number;
}

/**
 * A condition match emitted by the engine.
 */
export interface ConditionMatchResult {
  conditionId: string;
  organizationId: string;
  subscriberId: string;
  symbol: string;
  matchedValue: number;
  channels: string[];
  templateId?: string;
  timestampUs: number;
  matchDetail?: string;
}

/**
 * Batch of condition matches (received from Rust via ThreadsafeFunction).
 */
export interface ConditionMatchBatch {
  matches: ConditionMatchResult[];
  batch_timestamp_us: number;
}

/**
 * Built-in strategy types.
 */
export enum StrategyType {
  THRESHOLD_CROSSING = 'threshold_crossing',
  EXPRESSION = 'expression',
  SCRIPT = 'script',
}

/**
 * Strategy params for threshold crossing.
 */
export interface ThresholdCrossingParams {
  threshold: number;
  operator: 'cross_above' | 'cross_below' | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal' | 'equal' | 'not_equal';
}

/**
 * Strategy params for expression DSL.
 */
export interface ExpressionParams {
  expression: string;
}

/**
 * Strategy params for Rhai script.
 */
export interface ScriptParams {
  script: string;
}
