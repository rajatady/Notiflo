use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Cached subscriber routing data (stored in Redis, cached locally in LRU).
/// This is the data shape the Rust delivery router needs to resolve
/// a subscriber_id → channel endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriberRouting {
    pub subscriber_id: String,
    pub organization_id: String,
    /// Channel → endpoint mapping
    /// e.g., "email" → "user@example.com", "push" → "fcm_token_xxx", "sms" → "+1234567890"
    pub channel_endpoints: HashMap<String, String>,
    /// Channel preferences (which channels the subscriber has opted into)
    pub enabled_channels: Vec<String>,
    /// Provider overrides per channel (if subscriber has a preferred provider)
    pub provider_overrides: Option<HashMap<String, String>>,
}
