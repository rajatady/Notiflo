pub mod redis_queue;
pub mod websocket;

use anyhow::Result;
use async_trait::async_trait;
use shared_types::NormalizedTick;

/// Trait for all ingest connectors. Each connector implements this to
/// provide a stream of normalized ticks from an external data source.
#[async_trait]
pub trait IngestSource: Send + Sync {
    /// Establish connection to the data source.
    async fn connect(&mut self) -> Result<()>;

    /// Block until the next tick is available. Returns error on disconnect.
    async fn next_tick(&mut self) -> Result<NormalizedTick>;
}
