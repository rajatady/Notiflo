use shared_types::{DeliveryRequest, DeliveryResult};
use uuid::Uuid;

/// Zero-cost in-app delivery provider.
/// Skips HTTP entirely — returns an instant success DeliveryResult.
#[derive(Default)]
pub struct InAppProvider;

impl InAppProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn deliver(&self, request: &DeliveryRequest) -> DeliveryResult {
        DeliveryResult {
            request_id: request.id.clone(),
            condition_match_id: request.condition_match_id.clone(),
            organization_id: request.organization_id.clone(),
            subscriber_id: request.subscriber_id.clone(),
            channel: "in_app".to_string(),
            provider: "notiflo-in-app".to_string(),
            success: true,
            message_id: Some(Uuid::new_v4().to_string()),
            error: None,
            latency_us: 0,
            timestamp_us: now_us(),
        }
    }
}

fn now_us() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros() as u64
}
