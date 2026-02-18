use serde::{Deserialize, Serialize};

/// A request to deliver a notification via a specific channel/provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryRequest {
    pub id: String,
    pub condition_match_id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    pub channel: String,
    pub provider: String,
    pub rendered_content: serde_json::Value,
    pub timestamp_us: u64,
}

/// Result of a delivery attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryResult {
    pub request_id: String,
    pub condition_match_id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    pub channel: String,
    pub provider: String,
    pub success: bool,
    pub message_id: Option<String>,
    pub error: Option<String>,
    pub latency_us: u64,
    pub timestamp_us: u64,
}

/// A batch of delivery results sent back to Node.js via ThreadsafeFunction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryResultBatch {
    pub results: Vec<DeliveryResult>,
    pub batch_timestamp_us: u64,
}
