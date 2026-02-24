use anyhow::{Context, Result};
use async_trait::async_trait;
use tracing::{debug, info, warn};
use uuid::Uuid;

use serde::Deserialize;
use shared_types::NormalizedTick;

use super::IngestSource;

/// Raw tick format from data sources (e.g. ticker simulator).
/// Maps `price` → `value` and `timestamp` (ms) → `timestamp_us`.
#[derive(Deserialize)]
struct RawTick {
    symbol: String,
    price: f64,
    timestamp: u64,
}

pub struct RedisStreamSource {
    url: String,
    stream_key: String,
    consumer_group: String,
    consumer_name: String,
    connection: Option<redis::aio::MultiplexedConnection>,
}

impl RedisStreamSource {
    pub fn new(url: String, stream_key: String, consumer_group: String) -> Self {
        let consumer_name = format!("notiflo-{}", Uuid::new_v4());
        Self {
            url,
            stream_key,
            consumer_group,
            consumer_name,
            connection: None,
        }
    }
}

#[async_trait]
impl IngestSource for RedisStreamSource {
    async fn connect(&mut self) -> Result<()> {
        let client = redis::Client::open(self.url.as_str())
            .context("Failed to create Redis client")?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to connect to Redis")?;

        // Create consumer group (ignore BUSYGROUP error = group already exists)
        let result: redis::RedisResult<()> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(&self.stream_key)
            .arg(&self.consumer_group)
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut conn)
            .await;

        match result {
            Ok(()) => {
                info!(
                    stream_key = %self.stream_key,
                    consumer_group = %self.consumer_group,
                    "Created consumer group"
                );
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("BUSYGROUP") {
                    debug!(
                        consumer_group = %self.consumer_group,
                        "Consumer group already exists"
                    );
                } else {
                    return Err(e).context("Failed to create consumer group");
                }
            }
        }

        self.connection = Some(conn);
        info!(
            stream_key = %self.stream_key,
            consumer_group = %self.consumer_group,
            consumer_name = %self.consumer_name,
            "Redis stream ingest connected"
        );
        Ok(())
    }

    async fn next_tick(&mut self) -> Result<NormalizedTick> {
        let conn = self
            .connection
            .as_mut()
            .context("Redis not connected")?;

        loop {
            // XREADGROUP GROUP <group> <consumer> COUNT 1 BLOCK 1000 STREAMS <key> >
            let result: redis::RedisResult<redis::Value> = redis::cmd("XREADGROUP")
                .arg("GROUP")
                .arg(&self.consumer_group)
                .arg(&self.consumer_name)
                .arg("COUNT")
                .arg(1)
                .arg("BLOCK")
                .arg(1000)
                .arg("STREAMS")
                .arg(&self.stream_key)
                .arg(">")
                .query_async(conn)
                .await;

            let value = match result {
                Ok(v) => v,
                Err(e) => {
                    warn!(error = %e, "XREADGROUP failed, retrying");
                    continue;
                }
            };

            // Parse the nested Redis stream response:
            // Array([ Array([ BulkString(stream_key), Array([ Array([ BulkString(id), Array([ BulkString(field), BulkString(value), ... ]) ]) ]) ]) ])
            // Returns Nil on timeout (no new messages)
            if let redis::Value::Nil = value {
                continue;
            }

            let (message_id, data_json) = parse_stream_response(&value)
                .context("Failed to parse XREADGROUP response")?;

            let raw: RawTick = serde_json::from_str(&data_json)
                .with_context(|| {
                    format!(
                        "Failed to parse stream tick JSON: {}",
                        &data_json[..data_json.len().min(200)]
                    )
                })?;
            let tick = NormalizedTick::numeric(
                raw.symbol,
                raw.price,
                raw.timestamp * 1000, // ms → µs
            );

            // ACK the message
            let _: redis::RedisResult<i64> = redis::cmd("XACK")
                .arg(&self.stream_key)
                .arg(&self.consumer_group)
                .arg(&message_id)
                .query_async(conn)
                .await;

            debug!(
                symbol = %tick.symbol,
                value = tick.value,
                message_id = %message_id,
                "Tick received from Redis stream"
            );
            return Ok(tick);
        }
    }
}

/// Parse the nested XREADGROUP response to extract message ID and the `data` field value.
fn parse_stream_response(value: &redis::Value) -> Result<(String, String)> {
    // Expected structure:
    // Array([ Array([ BulkString(stream_key), Array([ Array([ BulkString(id), Array([field, value, ...]) ]) ]) ]) ])
    let streams = match value {
        redis::Value::Array(arr) => arr,
        _ => anyhow::bail!("Expected array from XREADGROUP, got: {:?}", value),
    };

    let stream_entry = streams
        .first()
        .context("Empty streams array")?;

    let stream_parts = match stream_entry {
        redis::Value::Array(arr) => arr,
        _ => anyhow::bail!("Expected array for stream entry"),
    };

    let messages = match stream_parts.get(1) {
        Some(redis::Value::Array(arr)) => arr,
        _ => anyhow::bail!("Expected messages array"),
    };

    let message = messages
        .first()
        .context("No messages in response")?;

    let message_parts = match message {
        redis::Value::Array(arr) => arr,
        _ => anyhow::bail!("Expected array for message"),
    };

    let message_id = match message_parts.first() {
        Some(redis::Value::BulkString(bytes)) => {
            String::from_utf8(bytes.clone()).context("Message ID is not UTF-8")?
        }
        _ => anyhow::bail!("Expected BulkString for message ID"),
    };

    let fields = match message_parts.get(1) {
        Some(redis::Value::Array(arr)) => arr,
        _ => anyhow::bail!("Expected fields array"),
    };

    // Fields are [field_name, field_value, field_name, field_value, ...]
    // Look for the "data" field
    let mut i = 0;
    while i + 1 < fields.len() {
        if let redis::Value::BulkString(key_bytes) = &fields[i] {
            let key = String::from_utf8_lossy(key_bytes);
            if key == "data" {
                if let redis::Value::BulkString(val_bytes) = &fields[i + 1] {
                    let val = String::from_utf8(val_bytes.clone())
                        .context("data field value is not UTF-8")?;
                    return Ok((message_id, val));
                }
            }
        }
        i += 2;
    }

    anyhow::bail!("No 'data' field found in stream message {}", message_id)
}
