use dashmap::DashMap;
use shared_types::AlertCondition;
use std::sync::Arc;

/// Thread-safe index mapping symbol → condition IDs.
/// Used by the engine to quickly find which conditions to evaluate
/// when a tick arrives for a given symbol.
pub struct ConditionIndex {
    /// symbol → list of condition IDs watching that symbol
    symbol_index: DashMap<String, Vec<String>>,
    /// condition_id → full condition data
    conditions: DashMap<String, Arc<AlertCondition>>,
}

impl ConditionIndex {
    pub fn new() -> Self {
        Self {
            symbol_index: DashMap::new(),
            conditions: DashMap::new(),
        }
    }

    pub fn add(&self, condition: AlertCondition) {
        let symbol = condition.symbol.clone();
        let id = condition.id.clone();
        self.conditions.insert(id.clone(), Arc::new(condition));
        self.symbol_index
            .entry(symbol)
            .or_default()
            .push(id);
    }

    pub fn remove(&self, condition_id: &str) -> Option<Arc<AlertCondition>> {
        let removed = self.conditions.remove(condition_id);
        if let Some((_, condition)) = &removed {
            // Remove from symbol index
            if let Some(mut ids) = self.symbol_index.get_mut(&condition.symbol) {
                ids.retain(|id| id != condition_id);
                if ids.is_empty() {
                    drop(ids);
                    self.symbol_index.remove(&condition.symbol);
                }
            }
        }
        removed.map(|(_, v)| v)
    }

    pub fn get(&self, condition_id: &str) -> Option<Arc<AlertCondition>> {
        self.conditions.get(condition_id).map(|v| v.clone())
    }

    pub fn get_conditions_for_symbol(&self, symbol: &str) -> Vec<Arc<AlertCondition>> {
        self.symbol_index
            .get(symbol)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.conditions.get(id).map(|v| v.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn condition_count(&self) -> u64 {
        self.conditions.len() as u64
    }

    pub fn symbol_count(&self) -> u64 {
        self.symbol_index.len() as u64
    }
}

impl Default for ConditionIndex {
    fn default() -> Self {
        Self::new()
    }
}
