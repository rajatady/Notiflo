use serde::{Deserialize, Serialize};

/// Operators for numeric threshold comparisons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOperator {
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Equal,
    NotEqual,
    CrossAbove,
    CrossBelow,
}

/// A user-defined alert condition.
///
/// The `strategy_type` field determines which EvaluationStrategy processes this
/// condition. The `strategy_params` field carries strategy-specific configuration
/// (e.g., threshold values, pattern strings, window sizes).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertCondition {
    pub id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    /// The symbol/entity this condition watches
    pub symbol: String,
    /// Which evaluation strategy handles this condition
    pub strategy_type: String,
    /// Strategy-specific parameters (opaque to the engine core)
    ///
    /// For ThresholdCrossing: { "operator": "cross_above", "threshold": 150.0 }
    /// For PatternMatch: { "pattern": "breaking.*market", "case_sensitive": false }
    /// For WindowAggregation: { "window_ms": 60000, "agg": "avg", "threshold": 100.0 }
    pub strategy_params: serde_json::Value,
    /// Notification channels to deliver on match
    pub channels: Vec<String>,
    /// Template ID for rendering the notification
    pub template_id: Option<String>,
    /// Whether this condition is currently active
    pub active: bool,
    /// Cooldown in milliseconds between repeated triggers
    pub cooldown_ms: Option<u64>,
    /// Last time this condition triggered (epoch us)
    pub last_triggered_us: Option<u64>,
}

/// Emitted when a condition matches against a tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionMatch {
    pub condition_id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    pub symbol: String,
    pub matched_value: f64,
    pub channels: Vec<String>,
    pub template_id: Option<String>,
    pub timestamp_us: u64,
    /// Strategy-specific match details (e.g., "crossed above 150.0 from 149.5")
    pub match_detail: Option<String>,
}
