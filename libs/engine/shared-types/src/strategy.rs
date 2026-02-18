use crate::{AlertCondition, ConditionMatch, NormalizedTick};

/// The core pluggable evaluation trait.
///
/// Each domain (financial alerts, IoT monitoring, news classification, etc.)
/// implements this trait with its own matching algorithm. The engine core
/// is generic over this trait — it handles lifecycle, indexing by symbol,
/// feed ingestion, delivery routing, etc., but delegates the actual
/// "does this tick match this condition?" logic to the strategy.
///
/// # Design rationale
///
/// Different domains have fundamentally different optimal matching algorithms:
///
/// - **ThresholdCrossing** (financial): Sorted B-tree of price levels per symbol.
///   Maintains "sentinel" nearest thresholds above/below current price. Most ticks
///   are O(1) no-ops (price didn't cross sentinel). Only on crossing: O(log n + k)
///   to find matches and recompute sentinels.
///
/// - **PatternMatch** (news/text): Aho-Corasick or regex-set against text_content.
///   Entirely different data structure (automaton vs tree).
///
/// - **WindowAggregation** (burst/rate): Sliding window accumulators per symbol.
///   Matches when aggregate (avg, sum, count) over window exceeds threshold.
///
/// - **EmbeddingSimilarity** (LLM/semantic): Vector similarity against condition
///   embedding. Requires ANN index (HNSW or similar).
///
/// - **Composite**: Chain multiple strategies, match if any/all sub-strategies match.
///
/// # Thread safety
///
/// Strategies must be Send + Sync because the engine runs evaluation on multiple
/// threads (one per feed or partitioned by symbol range).
pub trait EvaluationStrategy: Send + Sync {
    /// Called when a condition is added to the engine.
    /// The strategy should index/store it in whatever data structure it needs.
    fn add_condition(&self, condition: &AlertCondition);

    /// Called when a condition is removed from the engine.
    fn remove_condition(&self, condition_id: &str);

    /// Called when a condition is updated. Default: remove + re-add.
    fn update_condition(&self, condition: &AlertCondition) {
        self.remove_condition(&condition.id);
        self.add_condition(condition);
    }

    /// Evaluate a tick against all indexed conditions for that symbol.
    /// Returns all conditions that matched.
    ///
    /// This is THE hot path. Implementations must be as fast as possible:
    /// - Avoid allocations (reuse buffers where possible)
    /// - Avoid locks on the read path (use lock-free structures)
    /// - Target <1μs per call for the common case (no matches)
    fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch>;

    /// Returns the number of conditions currently indexed by this strategy.
    fn condition_count(&self) -> u64;

    /// Bulk load conditions (e.g., on startup from MongoDB).
    /// Default implementation calls add_condition in a loop.
    /// Strategies can override for batch-optimized loading.
    fn bulk_load(&self, conditions: &[AlertCondition]) {
        for condition in conditions {
            self.add_condition(condition);
        }
    }

    /// Returns the strategy type identifier (e.g., "threshold_crossing").
    /// Must match the `strategy_type` field on AlertCondition.
    fn strategy_type(&self) -> &'static str;
}
