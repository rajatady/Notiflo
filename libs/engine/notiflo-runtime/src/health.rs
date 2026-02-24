use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;

use crate::pipeline::PipelineStats;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    ticks_ingested: u64,
    ticks_evaluated: u64,
    matches_found: u64,
    ticks_dropped: u64,
    active_connectors: u64,
    uptime_secs: u64,
    avg_eval_latency_us: f64,
    max_eval_latency_us: u64,
    avg_delivery_latency_us: f64,
    deliveries_completed: u64,
    throughput_tps: f64,
}

struct HealthState {
    stats: Arc<PipelineStats>,
    started_at: Instant,
}

async fn health_handler(State(state): State<Arc<HealthState>>) -> Json<HealthResponse> {
    let ticks_ingested = state.stats.ticks_ingested.load(Ordering::Relaxed);
    let ticks_evaluated = state.stats.ticks_evaluated.load(Ordering::Relaxed);
    let deliveries_completed = state.stats.deliveries_completed.load(Ordering::Relaxed);
    let total_eval = state.stats.total_eval_latency_us.load(Ordering::Relaxed);
    let total_delivery = state
        .stats
        .total_delivery_latency_us
        .load(Ordering::Relaxed);
    let uptime_secs = state.started_at.elapsed().as_secs();

    let avg_eval = if ticks_evaluated > 0 {
        total_eval as f64 / ticks_evaluated as f64
    } else {
        0.0
    };

    let avg_delivery = if deliveries_completed > 0 {
        total_delivery as f64 / deliveries_completed as f64
    } else {
        0.0
    };

    let throughput = if uptime_secs > 0 {
        ticks_ingested as f64 / uptime_secs as f64
    } else {
        0.0
    };

    Json(HealthResponse {
        status: "ok",
        ticks_ingested,
        ticks_evaluated,
        matches_found: state.stats.matches_found.load(Ordering::Relaxed),
        ticks_dropped: state.stats.ticks_dropped.load(Ordering::Relaxed),
        active_connectors: state.stats.active_connectors.load(Ordering::Relaxed),
        uptime_secs,
        avg_eval_latency_us: avg_eval,
        max_eval_latency_us: state.stats.max_eval_latency_us.load(Ordering::Relaxed),
        avg_delivery_latency_us: avg_delivery,
        deliveries_completed,
        throughput_tps: throughput,
    })
}

/// Start the health check HTTP server on the given port.
pub async fn serve_health(port: u16, stats: Arc<PipelineStats>) {
    let state = Arc::new(HealthState {
        stats,
        started_at: Instant::now(),
    });

    let app = Router::new()
        .route("/health", get(health_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind health check port");

    tracing::info!(port, "Health check server started");
    axum::serve(listener, app).await.expect("Health server error");
}
