use shared_types::{AlertCondition, ConditionMatch, EvaluationStrategy, NormalizedTick};
use std::collections::HashMap;
use std::sync::Arc;

/// The strategy registry: holds all registered evaluation strategies
/// and dispatches conditions/ticks to the appropriate strategy based on
/// the condition's `strategy_type` field.
///
/// This is what makes the engine pluggable. New domains just register
/// a new strategy implementation — the rest of the engine (feed ingestion,
/// delivery routing, napi exports) works unchanged.
pub struct StrategyRegistry {
    strategies: HashMap<String, Arc<dyn EvaluationStrategy>>,
}

impl StrategyRegistry {
    pub fn new() -> Self {
        Self {
            strategies: HashMap::new(),
        }
    }

    /// Register a new evaluation strategy. The strategy's `strategy_type()`
    /// is used as the key. Conditions with matching `strategy_type` will be
    /// dispatched to this strategy.
    pub fn register(&mut self, strategy: Arc<dyn EvaluationStrategy>) {
        let key = strategy.strategy_type().to_string();
        self.strategies.insert(key, strategy);
    }

    /// Add a condition to the appropriate strategy (by strategy_type).
    /// Returns false if no strategy is registered for this condition's type.
    pub fn add_condition(&self, condition: &AlertCondition) -> bool {
        if let Some(strategy) = self.strategies.get(&condition.strategy_type) {
            strategy.add_condition(condition);
            true
        } else {
            false
        }
    }

    /// Remove a condition. Since we don't know which strategy owns it,
    /// we broadcast to all strategies. This is O(strategies) which is
    /// fine since we expect <10 strategies.
    pub fn remove_condition(&self, condition_id: &str) {
        for strategy in self.strategies.values() {
            strategy.remove_condition(condition_id);
        }
    }

    /// Update a condition in its strategy.
    pub fn update_condition(&self, condition: &AlertCondition) -> bool {
        if let Some(strategy) = self.strategies.get(&condition.strategy_type) {
            strategy.update_condition(condition);
            true
        } else {
            false
        }
    }

    /// Bulk load conditions, dispatching each to the appropriate strategy.
    /// Returns the count of successfully loaded conditions.
    pub fn bulk_load(&self, conditions: &[AlertCondition]) -> u32 {
        // Group by strategy_type for batch loading
        let mut grouped: HashMap<&str, Vec<&AlertCondition>> = HashMap::new();
        for cond in conditions {
            grouped.entry(&cond.strategy_type).or_default().push(cond);
        }

        let mut loaded = 0u32;
        for (strategy_type, conds) in grouped {
            if let Some(strategy) = self.strategies.get(strategy_type) {
                let owned: Vec<AlertCondition> = conds.into_iter().cloned().collect();
                strategy.bulk_load(&owned);
                loaded += owned.len() as u32;
            }
        }
        loaded
    }

    /// Evaluate a tick against ALL registered strategies.
    /// Each strategy checks if it has conditions for this tick's symbol.
    pub fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch> {
        let mut all_matches = Vec::new();
        for strategy in self.strategies.values() {
            let matches = strategy.evaluate(tick);
            if !matches.is_empty() {
                all_matches.extend(matches);
            }
        }
        all_matches
    }

    /// Total condition count across all strategies.
    pub fn total_condition_count(&self) -> u64 {
        self.strategies.values().map(|s| s.condition_count()).sum()
    }

    /// Per-strategy metrics.
    pub fn strategy_metrics(&self) -> Vec<(String, u64)> {
        self.strategies
            .iter()
            .map(|(name, s)| (name.clone(), s.condition_count()))
            .collect()
    }

    pub fn has_strategy(&self, strategy_type: &str) -> bool {
        self.strategies.contains_key(strategy_type)
    }
}

impl Default for StrategyRegistry {
    fn default() -> Self {
        Self::new()
    }
}
