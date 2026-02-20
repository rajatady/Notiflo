use serde::{Deserialize, Serialize};

/// A normalized data point from any real-time feed.
///
/// This is the universal input to the evaluation engine. Different domains
/// populate different fields:
/// - Financial: symbol, price, volume
/// - IoT: symbol (sensor_id), value (reading), metadata
/// - News/Text: symbol (topic), text_content
/// - Generic: symbol (entity_id), value (metric), metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedTick {
    /// The entity identifier (stock symbol, sensor ID, topic, etc.)
    pub symbol: String,
    /// Primary numeric value (price, reading, score, etc.)
    pub value: f64,
    /// Optional secondary numeric value (volume, confidence, etc.)
    pub secondary_value: Option<f64>,
    /// Optional text content (news headline, log message, etc.)
    pub text_content: Option<String>,
    /// Timestamp in epoch microseconds
    pub timestamp_us: u64,
    /// Arbitrary key-value metadata for domain-specific fields
    pub metadata: Option<serde_json::Value>,
}

impl NormalizedTick {
    /// Create a simple numeric tick (most common case: price alerts, IoT thresholds)
    pub fn numeric(symbol: String, value: f64, timestamp_us: u64) -> Self {
        Self {
            symbol,
            value,
            secondary_value: None,
            text_content: None,
            timestamp_us,
            metadata: None,
        }
    }
}
