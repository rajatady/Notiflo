pub mod dead_letter;
pub mod http_provider;
pub mod in_app_provider;
pub mod retry;
pub mod router;

use std::sync::atomic::Ordering;
use std::sync::Arc;

use tokio::sync::mpsc;
use tracing::{error, info};

use shared_types::ConditionMatch;

use crate::event_log::EventLog;
use crate::pipeline::PipelineStats;

use self::http_provider::HttpProvider;
use self::in_app_provider::InAppProvider;
use self::router::DeliveryRouter;

/// Runs the delivery loop: receives match batches, resolves subscribers,
/// renders templates, delivers via HTTP or in-app, logs events.
pub async fn run_delivery(
    mut rx: mpsc::Receiver<Vec<ConditionMatch>>,
    router: Arc<DeliveryRouter>,
    provider: Arc<HttpProvider>,
    in_app: Arc<InAppProvider>,
    event_log: Arc<EventLog>,
    dead_letter: Arc<dead_letter::DeadLetterQueue>,
    stats: Arc<PipelineStats>,
) {
    info!("Delivery loop started");

    while let Some(matches) = rx.recv().await {
        for condition_match in matches {
            let requests = match router.resolve(&condition_match).await {
                Ok(r) => r,
                Err(e) => {
                    error!(
                        condition_id = %condition_match.condition_id,
                        error = %e,
                        "Failed to resolve delivery requests"
                    );
                    continue;
                }
            };

            for request in requests {
                let result = if request.channel == "in_app" {
                    in_app.deliver(&request)
                } else {
                    provider.send_with_retry(&request).await
                };

                stats.deliveries_completed.fetch_add(1, Ordering::Relaxed);
                stats
                    .total_delivery_latency_us
                    .fetch_add(result.latency_us, Ordering::Relaxed);

                // Pass rendered_content for in_app channel
                let content = if request.channel == "in_app" {
                    Some(&request.rendered_content)
                } else {
                    None
                };

                // Log the delivery event to Redis stream
                if let Err(e) = event_log.log_delivery(&result, content).await {
                    error!(error = %e, "Failed to log delivery event");
                }

                // If delivery failed after retries, push to dead letter queue
                if !result.success {
                    if let Err(e) = dead_letter
                        .push(&request, result.error.as_deref().unwrap_or("unknown"))
                        .await
                    {
                        error!(error = %e, "Failed to push to dead letter queue");
                    }
                }
            }
        }
    }

    info!("Delivery loop ended (channel closed)");
}
