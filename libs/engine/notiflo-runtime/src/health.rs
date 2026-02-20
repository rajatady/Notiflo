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
    uptime_secs: u64,
}

struct HealthState {
    stats: Arc<PipelineStats>,
    started_at: Instant,
}

async fn health_handler(State(state): State<Arc<HealthState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        ticks_ingested: state.stats.ticks_ingested.load(Ordering::Relaxed),
        ticks_evaluated: state.stats.ticks_evaluated.load(Ordering::Relaxed),
        matches_found: state.stats.matches_found.load(Ordering::Relaxed),
        ticks_dropped: state.stats.ticks_dropped.load(Ordering::Relaxed),
        uptime_secs: state.started_at.elapsed().as_secs(),
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
