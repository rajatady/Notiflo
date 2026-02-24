mod config;
mod config_loader;
mod connector_loader;
mod delivery;
mod event_log;
mod health;
mod ingest;
mod pipeline;
mod subscriber_cache;
mod template;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use bson::DateTime as BsonDateTime;
use clap::Parser;
use crossbeam_channel::bounded;
use mongodb::Client as MongoClient;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::{self, Duration};
use tracing::{error, info, warn};

use engine_core::condition::evaluator::StrategyRegistry;
use engine_core::condition::expression_strategy::ExpressionStrategy;
use engine_core::condition::script_strategy::ScriptStrategy;
use engine_core::condition::store::ConditionStore;
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;

use crate::config::RuntimeConfig;
use crate::config_loader::ConfigLoader;
use crate::connector_loader::{ConnectorLoader, MongoConnector};
use crate::delivery::dead_letter::DeadLetterQueue;
use crate::delivery::http_provider::HttpProvider;
use crate::delivery::in_app_provider::InAppProvider;
use crate::delivery::router::DeliveryRouter;
use crate::event_log::EventLog;
use crate::ingest::redis_queue::RedisQueueSource;
use crate::ingest::redis_stream::RedisStreamSource;
use crate::ingest::websocket::WebSocketSource;
use crate::ingest::IngestSource;
use crate::pipeline::PipelineStats;
use crate::subscriber_cache::SubscriberCache;
use crate::template::TemplateRenderer;

/// Per-connector runtime state: the task handle and tick counter.
struct ConnectorHandle {
    handle: JoinHandle<()>,
    tick_counter: Arc<AtomicU64>,
    #[allow(dead_code)]
    connector_id: String,
}

/// Factory: create an IngestSource from a MongoConnector document.
fn create_ingest_source(
    connector: &MongoConnector,
    default_redis_url: &str,
) -> Result<Box<dyn IngestSource>> {
    let config = &connector.config;
    match connector.connector_type.as_str() {
        "redis_queue" => {
            let url = config
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or(default_redis_url)
                .to_string();
            let queue_key = config
                .get("queueKey")
                .and_then(|v| v.as_str())
                .unwrap_or("notiflo:ticks")
                .to_string();
            Ok(Box::new(RedisQueueSource::new(url, queue_key)))
        }
        "redis_stream" => {
            let url = config
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or(default_redis_url)
                .to_string();
            let stream_key = config
                .get("streamKey")
                .and_then(|v| v.as_str())
                .unwrap_or("notiflo:stream")
                .to_string();
            let consumer_group = config
                .get("consumerGroup")
                .and_then(|v| v.as_str())
                .unwrap_or("notiflo-runtime")
                .to_string();
            Ok(Box::new(RedisStreamSource::new(
                url,
                stream_key,
                consumer_group,
            )))
        }
        "websocket" => {
            let ws_url = config
                .get("url")
                .and_then(|v| v.as_str())
                .context("websocket connector requires 'url' in config")?
                .to_string();
            let reconnect_ms = config
                .get("reconnectMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(3000);
            Ok(Box::new(WebSocketSource::new(ws_url, reconnect_ms)))
        }
        other => anyhow::bail!("Unknown connector type: {}", other),
    }
}

/// Spawn an ingest task for a connector. Returns the ConnectorHandle.
fn spawn_connector_task(
    connector: &MongoConnector,
    default_redis_url: &str,
    tick_tx: mpsc::Sender<shared_types::NormalizedTick>,
    stats: Arc<PipelineStats>,
) -> Result<ConnectorHandle> {
    let connector_id = connector.id_hex();
    let source = create_ingest_source(connector, default_redis_url)?;
    let tick_counter = Arc::new(AtomicU64::new(0));
    let counter_clone = tick_counter.clone();

    let handle = tokio::spawn(pipeline::run_ingest(
        source,
        tick_tx,
        stats,
        connector_id.clone(),
        counter_clone,
    ));

    Ok(ConnectorHandle {
        handle,
        tick_counter,
        connector_id,
    })
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing (structured logging)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "notiflo_runtime=info".into()),
        )
        .json()
        .init();

    let config = RuntimeConfig::parse();
    info!(
        mongodb = %config.mongodb_uri,
        redis = %config.redis_url,
        "Starting Notiflo Runtime"
    );

    // Connect to MongoDB
    let mongo_client = MongoClient::with_uri_str(&config.mongodb_uri)
        .await
        .context("Failed to connect to MongoDB")?;
    let db = mongo_client.database(&config.db_name);
    info!(db = %config.db_name, "Connected to MongoDB");

    // Initialize the evaluation engine (same code path as napi, minus the napi wrapper)
    let mut registry = StrategyRegistry::new();
    registry.register(Arc::new(ThresholdCrossingStrategy::new()));
    registry.register(Arc::new(ExpressionStrategy::new()));
    registry.register(Arc::new(ScriptStrategy::new()));

    let (match_sender, _match_receiver) = bounded(config.buffer_size);
    let store = Arc::new(ConditionStore::new(Arc::new(registry), match_sender));
    info!("Evaluation engine initialized with 3 strategies");

    // Load conditions from MongoDB
    let conditions_collection = db.collection("alertconditions");
    let mut config_loader =
        ConfigLoader::new(conditions_collection, store.clone(), config.config_poll_interval_ms);
    let loaded = config_loader.initial_load().await?;
    info!(conditions = loaded, "Initial condition load complete");

    // Initialize subscriber cache
    let subscriber_collection = db.collection("subscribers");
    let subscriber_cache = SubscriberCache::new(subscriber_collection);

    // Initialize template renderer
    let template_collection = db.collection("notiflo_templates");
    let template_renderer = TemplateRenderer::new(Some(template_collection));
    template_renderer.load_templates().await?;

    // Initialize delivery components
    let event_log = Arc::new(
        EventLog::new(&config.redis_url)
            .await
            .context("Failed to initialize event log")?,
    );
    event_log.ensure_consumer_group().await?;

    let dead_letter = Arc::new(
        DeadLetterQueue::new(&config.redis_url)
            .await
            .context("Failed to initialize dead letter queue")?,
    );

    let http_provider = Arc::new(HttpProvider::new());
    let in_app_provider = Arc::new(InAppProvider::new());
    let delivery_router = Arc::new(DeliveryRouter::new(subscriber_cache, template_renderer));

    // Create pipeline channels
    let (tick_tx, tick_rx) = tokio::sync::mpsc::channel(config.buffer_size);
    let (delivery_tx, delivery_rx) = tokio::sync::mpsc::channel(4096);

    let stats = Arc::new(PipelineStats::new());

    // ── Load connectors from MongoDB and spawn ingest tasks ──
    let connectors_collection = db.collection("connectors");
    let mut connector_loader = ConnectorLoader::new(connectors_collection);
    let initial_connectors = connector_loader.initial_load().await?;

    let mut connector_tasks: HashMap<String, ConnectorHandle> = HashMap::new();

    for connector in &initial_connectors {
        let connector_id = connector.id_hex();
        match spawn_connector_task(connector, &config.redis_url, tick_tx.clone(), stats.clone()) {
            Ok(handle) => {
                info!(
                    connector_id = %connector_id,
                    connector_type = %connector.connector_type,
                    name = %connector.name,
                    "Spawned ingest task for connector"
                );
                connector_tasks.insert(connector_id, handle);
            }
            Err(e) => {
                error!(
                    connector_id = %connector_id,
                    error = %e,
                    "Failed to create ingest source for connector"
                );
            }
        }
    }

    stats
        .active_connectors
        .store(connector_tasks.len() as u64, Ordering::Relaxed);

    info!(
        active_connectors = connector_tasks.len(),
        "All components initialized. Starting pipeline..."
    );

    // Spawn evaluator
    let eval_handle = tokio::spawn(pipeline::run_evaluator(
        tick_rx,
        store.clone(),
        delivery_tx,
        stats.clone(),
    ));

    // Spawn delivery
    let delivery_handle = tokio::spawn(delivery::run_delivery(
        delivery_rx,
        delivery_router,
        http_provider,
        in_app_provider,
        event_log,
        dead_letter,
        stats.clone(),
    ));

    // Spawn config poll loop
    let config_poll_handle = tokio::spawn(async move {
        config_loader.poll_loop().await;
    });

    // Spawn health server
    let health_handle = tokio::spawn(health::serve_health(config.health_port, stats.clone()));

    // ── Connector poll loop: detect added/removed/updated connectors ──
    let connector_poll_redis_url = config.redis_url.clone();
    let connector_poll_stats = stats.clone();
    let connector_poll_tick_tx = tick_tx.clone();
    let connector_poll_interval = config.connector_poll_interval_ms;

    let connector_poll_handle = tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_millis(connector_poll_interval));
        // Skip immediate first tick
        interval.tick().await;

        loop {
            interval.tick().await;

            match connector_loader.poll_changes().await {
                Ok(changes) => {
                    // Remove connectors
                    for id in &changes.removed {
                        if let Some(handle) = connector_tasks.remove(id) {
                            handle.handle.abort();
                            info!(connector_id = %id, "Removed connector, task aborted");
                        }
                    }

                    // Add new connectors
                    for connector in &changes.added {
                        let connector_id = connector.id_hex();
                        match spawn_connector_task(
                            connector,
                            &connector_poll_redis_url,
                            connector_poll_tick_tx.clone(),
                            connector_poll_stats.clone(),
                        ) {
                            Ok(handle) => {
                                info!(
                                    connector_id = %connector_id,
                                    connector_type = %connector.connector_type,
                                    name = %connector.name,
                                    "Spawned new connector"
                                );
                                connector_tasks.insert(connector_id, handle);
                            }
                            Err(e) => {
                                error!(
                                    connector_id = %connector_id,
                                    error = %e,
                                    "Failed to create ingest source for new connector"
                                );
                            }
                        }
                    }

                    // Updated connectors: restart task with new config
                    for connector in &changes.updated {
                        let connector_id = connector.id_hex();
                        // Abort old task
                        if let Some(old_handle) = connector_tasks.remove(&connector_id) {
                            old_handle.handle.abort();
                        }
                        // Spawn replacement
                        match spawn_connector_task(
                            connector,
                            &connector_poll_redis_url,
                            connector_poll_tick_tx.clone(),
                            connector_poll_stats.clone(),
                        ) {
                            Ok(handle) => {
                                info!(
                                    connector_id = %connector_id,
                                    "Restarted connector with updated config"
                                );
                                connector_tasks.insert(connector_id, handle);
                            }
                            Err(e) => {
                                error!(
                                    connector_id = %connector_id,
                                    error = %e,
                                    "Failed to restart connector"
                                );
                            }
                        }
                    }

                    connector_poll_stats
                        .active_connectors
                        .store(connector_tasks.len() as u64, Ordering::Relaxed);
                }
                Err(e) => {
                    error!(error = %e, "Connector poll failed");
                }
            }

            // ── Status writeback: update MongoDB with ticks_ingested/status per connector ──
            for (id, ch) in &connector_tasks {
                let ticks = ch.tick_counter.load(Ordering::Relaxed);
                let status = if ch.handle.is_finished() {
                    "stopped"
                } else {
                    "running"
                };
                let last_tick_at = if ticks > 0 {
                    Some(BsonDateTime::now())
                } else {
                    None
                };

                if let Err(e) =
                    connector_loader
                        .update_status(id, status, ticks, last_tick_at)
                        .await
                {
                    warn!(connector_id = %id, error = %e, "Failed to write connector status");
                }
            }
        }
    });

    info!(
        health_port = config.health_port,
        "Notiflo Runtime is running"
    );

    // Wait for any task to complete (they should all run forever)
    tokio::select! {
        r = eval_handle => {
            error!("Evaluator task exited: {:?}", r);
        }
        r = delivery_handle => {
            error!("Delivery task exited: {:?}", r);
        }
        r = config_poll_handle => {
            error!("Config poll task exited: {:?}", r);
        }
        r = connector_poll_handle => {
            error!("Connector poll task exited: {:?}", r);
        }
        r = health_handle => {
            error!("Health server exited: {:?}", r);
        }
    }

    Ok(())
}
