use crossbeam_channel::{Sender, TrySendError};
use shared_types::{AlertCondition, ConditionMatch, NormalizedTick};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use super::evaluator::StrategyRegistry;
use super::types::ConditionMatchBatch;

/// The ConditionStore is the top-level orchestrator for condition evaluation.
///
/// It owns the strategy registry and the crossbeam channel for emitting matches.
/// The hot path: tick → registry.evaluate(tick) → channel.send(matches)
pub struct ConditionStore {
    registry: Arc<StrategyRegistry>,
    match_sender: Sender<ConditionMatchBatch>,
    total_ticks: AtomicU64,
    total_matches: AtomicU64,
}

impl ConditionStore {
    pub fn new(
        registry: Arc<StrategyRegistry>,
        match_sender: Sender<ConditionMatchBatch>,
    ) -> Self {
        Self {
            registry,
            match_sender,
            total_ticks: AtomicU64::new(0),
            total_matches: AtomicU64::new(0),
        }
    }

    /// Evaluate a tick against all strategies and emit matches.
    /// This is the hot path — called for every incoming tick.
    #[inline]
    pub fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch> {
        self.total_ticks.fetch_add(1, Ordering::Relaxed);

        let matches = self.registry.evaluate(tick);

        if !matches.is_empty() {
            self.total_matches
                .fetch_add(matches.len() as u64, Ordering::Relaxed);

            let batch = ConditionMatchBatch {
                matches: matches.clone(),
                batch_timestamp_us: tick.timestamp_us,
            };

            // Non-blocking send — if the channel is full, we drop the batch
            // (backpressure: Node.js callback isn't keeping up)
            match self.match_sender.try_send(batch) {
                Ok(_) => {}
                Err(TrySendError::Full(_)) => {
                    // TODO: increment a dropped_batches counter
                }
                Err(TrySendError::Disconnected(_)) => {
                    // Receiver dropped — engine is shutting down
                }
            }
        }

        matches
    }

    /// Add a condition to the appropriate strategy.
    pub fn add_condition(&self, condition: &AlertCondition) -> bool {
        self.registry.add_condition(condition)
    }

    /// Remove a condition from all strategies.
    pub fn remove_condition(&self, condition_id: &str) {
        self.registry.remove_condition(condition_id);
    }

    /// Update a condition.
    pub fn update_condition(&self, condition: &AlertCondition) -> bool {
        self.registry.update_condition(condition)
    }

    /// Bulk load conditions.
    pub fn bulk_load(&self, conditions: &[AlertCondition]) -> u32 {
        self.registry.bulk_load(conditions)
    }

    /// Total conditions across all strategies.
    pub fn condition_count(&self) -> u64 {
        self.registry.total_condition_count()
    }

    pub fn total_ticks(&self) -> u64 {
        self.total_ticks.load(Ordering::Relaxed)
    }

    pub fn total_matches(&self) -> u64 {
        self.total_matches.load(Ordering::Relaxed)
    }

    pub fn registry(&self) -> &StrategyRegistry {
        &self.registry
    }
}
