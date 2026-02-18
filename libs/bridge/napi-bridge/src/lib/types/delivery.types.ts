/**
 * Engine-level metrics returned by getEngineMetrics().
 */
export interface EngineMetrics {
  totalConditions: number;
  totalTicksProcessed: number;
  totalMatches: number;
  ticksPerSecond: number;
  matchesPerSecond: number;
  avgEvaluationUs: number;
  strategies: StrategyMetrics[];
}

export interface StrategyMetrics {
  strategyType: string;
  conditionCount: number;
}
