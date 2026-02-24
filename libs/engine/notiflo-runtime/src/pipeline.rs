use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use engine_core::condition::store::ConditionStore;
use shared_types::{ConditionMatch, NormalizedTick};

use crate::ingest::IngestSource;

/// Pipeline stats, readable from the health endpoint.
pub struct PipelineStats {
    pub ticks_ingested: AtomicU64,
    pub ticks_evaluated: AtomicU64,
    pub matches_found: AtomicU64,
    pub ticks_dropped: AtomicU64,
    pub active_connectors: AtomicU64,
    pub total_eval_latency_us: AtomicU64,
    pub max_eval_latency_us: AtomicU64,
    pub total_delivery_latency_us: AtomicU64,
    pub deliveries_completed: AtomicU64,
}

impl Default for PipelineStats {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineStats {
    pub fn new() -> Self {
        Self {
            ticks_ingested: AtomicU64::new(0),
            ticks_evaluated: AtomicU64::new(0),
            matches_found: AtomicU64::new(0),
            ticks_dropped: AtomicU64::new(0),
            active_connectors: AtomicU64::new(0),
            total_eval_latency_us: AtomicU64::new(0),
            max_eval_latency_us: AtomicU64::new(0),
            total_delivery_latency_us: AtomicU64::new(0),
            deliveries_completed: AtomicU64::new(0),
        }
    }
}

/// Runs the ingest -> channel producer loop for a single connector.
/// Sends ticks into a bounded mpsc channel for the evaluator to consume.
/// Increments per-connector tick counter and global stats.
pub async fn run_ingest(
    mut source: Box<dyn IngestSource>,
    tx: mpsc::Sender<NormalizedTick>,
    stats: Arc<PipelineStats>,
    connector_id: String,
    connector_tick_counter: Arc<AtomicU64>,
) {
    let span = tracing::info_span!("ingest", connector_id = %connector_id);
    let _guard = span.enter();

    if let Err(e) = source.connect().await {
        tracing::error!(connector_id = %connector_id, error = %e, "Failed to connect ingest source");
        return;
    }

    drop(_guard);

    loop {
        match source.next_tick().await {
            Ok(tick) => {
                stats.ticks_ingested.fetch_add(1, Ordering::Relaxed);
                connector_tick_counter.fetch_add(1, Ordering::Relaxed);
                if tx.try_send(tick).is_err() {
                    stats.ticks_dropped.fetch_add(1, Ordering::Relaxed);
                    // Backpressure: evaluator can't keep up. Log periodically.
                    let dropped = stats.ticks_dropped.load(Ordering::Relaxed);
                    if dropped.is_multiple_of(1000) {
                        warn!(connector_id = %connector_id, dropped, "Pipeline backpressure — ticks dropped");
                    }
                }
            }
            Err(e) => {
                tracing::error!(connector_id = %connector_id, error = %e, "Ingest source error");
                // The source should handle reconnection internally.
                // If it returns an error here, it's a parse error on a single tick.
                // Continue to next tick.
            }
        }
    }
}

/// Runs the evaluate -> deliver loop.
/// Consumes ticks from the channel, evaluates against all conditions,
/// fans out matches to delivery and event log.
pub async fn run_evaluator(
    mut rx: mpsc::Receiver<NormalizedTick>,
    store: Arc<ConditionStore>,
    delivery_tx: mpsc::Sender<Vec<ConditionMatch>>,
    stats: Arc<PipelineStats>,
) {
    info!("Evaluator loop started");

    while let Some(tick) = rx.recv().await {
        let eval_start = Instant::now();
        let matches = store.evaluate(&tick);
        let eval_us = eval_start.elapsed().as_micros() as u64;
        stats.ticks_evaluated.fetch_add(1, Ordering::Relaxed);
        stats
            .total_eval_latency_us
            .fetch_add(eval_us, Ordering::Relaxed);
        stats
            .max_eval_latency_us
            .fetch_max(eval_us, Ordering::Relaxed);

        if !matches.is_empty() {
            let match_count = matches.len() as u64;
            stats.matches_found.fetch_add(match_count, Ordering::Relaxed);
            debug!(
                symbol = %tick.symbol,
                matches = match_count,
                "Condition matches found"
            );

            // Send matches to delivery pipeline (non-blocking)
            if delivery_tx.try_send(matches).is_err() {
                warn!("Delivery channel full — matches dropped");
            }
        }
    }

    info!("Evaluator loop ended (channel closed)");
}
