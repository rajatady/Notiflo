use anyhow::{Context, Result};
use redis::AsyncCommands;
use tracing::debug;

use shared_types::DeliveryRequest;

/// Dead letter queue backed by Redis lists.
/// Failed deliveries are pushed here for later inspection/retry.
pub struct DeadLetterQueue {
    connection: redis::aio::MultiplexedConnection,
}

impl DeadLetterQueue {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)
            .context("Failed to create DLQ Redis client")?;
        let connection = client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to connect DLQ to Redis")?;
        Ok(Self { connection })
    }

    /// Push a failed delivery to the dead letter queue.
    pub async fn push(&self, request: &DeliveryRequest, error: &str) -> Result<()> {
        let key = format!("notiflo:dlq:{}", request.organization_id);
        let entry = serde_json::json!({
            "request": request,
            "error": error,
            "timestamp_us": now_us(),
        });
        let payload = serde_json::to_string(&entry)?;

        let mut conn = self.connection.clone();
        conn.lpush::<_, _, ()>(&key, payload)
            .await
            .context("Failed to LPUSH to DLQ")?;

        debug!(
            key = %key,
            request_id = %request.id,
            "Delivery pushed to dead letter queue"
        );
        Ok(())
    }
}

fn now_us() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros() as u64
}
