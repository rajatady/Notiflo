use anyhow::{Context, Result};
use async_trait::async_trait;
use tracing::{debug, info};

use shared_types::NormalizedTick;

use super::IngestSource;

pub struct RedisQueueSource {
    url: String,
    queue_key: String,
    connection: Option<redis::aio::MultiplexedConnection>,
}

impl RedisQueueSource {
    pub fn new(url: String, queue_key: String) -> Self {
        Self {
            url,
            queue_key,
            connection: None,
        }
    }
}

#[async_trait]
impl IngestSource for RedisQueueSource {
    async fn connect(&mut self) -> Result<()> {
        let client = redis::Client::open(self.url.as_str())
            .context("Failed to create Redis client")?;
        let conn = client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to connect to Redis")?;
        self.connection = Some(conn);
        info!(queue_key = %self.queue_key, "Redis ingest connected");
        Ok(())
    }

    async fn next_tick(&mut self) -> Result<NormalizedTick> {
        let conn = self
            .connection
            .as_mut()
            .context("Redis not connected")?;

        // BRPOP blocks until an item is available (1 second timeout, then retry)
        loop {
            let result: Option<(String, String)> = redis::cmd("BRPOP")
                .arg(&self.queue_key)
                .arg(1) // 1 second timeout
                .query_async(conn)
                .await
                .context("Redis BRPOP failed")?;

            if let Some((_key, value)) = result {
                let tick: NormalizedTick = serde_json::from_str(&value)
                    .with_context(|| format!("Failed to parse tick JSON: {}", &value[..value.len().min(200)]))?;
                debug!(symbol = %tick.symbol, value = tick.value, "Tick received from Redis");
                return Ok(tick);
            }
            // Timeout — loop and retry BRPOP
        }
    }
}
