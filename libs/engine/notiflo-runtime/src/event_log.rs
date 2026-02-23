use anyhow::{Context, Result};
use tracing::debug;

use shared_types::DeliveryResult;

const STREAM_KEY: &str = "notiflo:events:delivery";
const MAX_STREAM_LEN: usize = 100_000;

/// Writes delivery events to a Redis stream for NestJS to consume.
pub struct EventLog {
    connection: redis::aio::MultiplexedConnection,
}

impl EventLog {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)
            .context("Failed to create EventLog Redis client")?;
        let connection = client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to connect EventLog to Redis")?;
        Ok(Self { connection })
    }

    /// Log a delivery result to the Redis stream.
    /// `content` is optionally provided for in_app channel to include rendered notification body.
    pub async fn log_delivery(
        &self,
        result: &DeliveryResult,
        content: Option<&serde_json::Value>,
    ) -> Result<()> {
        let mut conn = self.connection.clone();

        let rendered = content
            .map(|c| serde_json::to_string(c).unwrap_or_default())
            .unwrap_or_default();

        // XADD with approximate trimming
        redis::cmd("XADD")
            .arg(STREAM_KEY)
            .arg("MAXLEN")
            .arg("~")
            .arg(MAX_STREAM_LEN)
            .arg("*") // auto-generate ID
            .arg("request_id")
            .arg(&result.request_id)
            .arg("condition_match_id")
            .arg(&result.condition_match_id)
            .arg("organization_id")
            .arg(&result.organization_id)
            .arg("subscriber_id")
            .arg(&result.subscriber_id)
            .arg("channel")
            .arg(&result.channel)
            .arg("provider")
            .arg(&result.provider)
            .arg("success")
            .arg(if result.success { "true" } else { "false" })
            .arg("message_id")
            .arg(result.message_id.as_deref().unwrap_or(""))
            .arg("error")
            .arg(result.error.as_deref().unwrap_or(""))
            .arg("latency_us")
            .arg(result.latency_us)
            .arg("timestamp_us")
            .arg(result.timestamp_us)
            .arg("rendered_content")
            .arg(&rendered)
            .query_async::<String>(&mut conn)
            .await
            .context("Failed to XADD delivery event")?;

        debug!(
            request_id = %result.request_id,
            success = result.success,
            "Delivery event logged to stream"
        );

        Ok(())
    }

    /// Ensure the consumer group exists (called on startup).
    pub async fn ensure_consumer_group(&self) -> Result<()> {
        let mut conn = self.connection.clone();

        // Create consumer group, ignore error if it already exists
        let result: redis::RedisResult<()> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(STREAM_KEY)
            .arg("notiflo-api")
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut conn)
            .await;

        match result {
            Ok(()) => {
                tracing::info!("Created consumer group 'notiflo-api' on {}", STREAM_KEY);
            }
            Err(e) if e.to_string().contains("BUSYGROUP") => {
                // Group already exists, that's fine
                debug!("Consumer group 'notiflo-api' already exists");
            }
            Err(e) => return Err(e.into()),
        }

        Ok(())
    }
}
