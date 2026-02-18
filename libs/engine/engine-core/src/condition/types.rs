use serde::{Deserialize, Serialize};

/// Configuration for the condition engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    /// Number of evaluation threads (default: number of CPUs)
    pub evaluation_threads: Option<u32>,
    /// Ring buffer size for match channel (default: 65536)
    pub ring_buffer_size: Option<usize>,
    /// Default cooldown between repeated triggers in ms (default: 60000)
    pub default_cooldown_ms: Option<u64>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            evaluation_threads: None,
            ring_buffer_size: Some(65536),
            default_cooldown_ms: Some(60000),
        }
    }
}

/// A batch of condition matches sent to Node.js.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionMatchBatch {
    pub matches: Vec<shared_types::ConditionMatch>,
    pub batch_timestamp_us: u64,
}

/// Engine-level metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineMetrics {
    pub total_conditions: u64,
    pub total_ticks_processed: u64,
    pub total_matches: u64,
    pub ticks_per_second: f64,
    pub matches_per_second: f64,
    pub avg_evaluation_us: f64,
    pub strategies: Vec<StrategyMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyMetrics {
    pub strategy_type: String,
    pub condition_count: u64,
}
