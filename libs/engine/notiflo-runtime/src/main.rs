mod config;
mod config_loader;
mod delivery;
mod event_log;
mod health;
mod ingest;
mod pipeline;
mod subscriber_cache;
mod template;

use std::sync::Arc;

use anyhow::{Context, Result};
use clap::Parser;
use crossbeam_channel::bounded;
use mongodb::Client as MongoClient;
use tracing::info;

use engine_core::condition::evaluator::StrategyRegistry;
use engine_core::condition::expression_strategy::ExpressionStrategy;
use engine_core::condition::script_strategy::ScriptStrategy;
use engine_core::condition::store::ConditionStore;
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;

use crate::config::{IngestType, RuntimeConfig};
use crate::config_loader::ConfigLoader;
use crate::delivery::dead_letter::DeadLetterQueue;
use crate::delivery::http_provider::HttpProvider;
use crate::delivery::router::DeliveryRouter;
use crate::event_log::EventLog;
use crate::ingest::redis_queue::RedisQueueSource;
use crate::ingest::websocket::WebSocketSource;
use crate::ingest::IngestSource;
use crate::pipeline::PipelineStats;
use crate::subscriber_cache::SubscriberCache;
use crate::template::TemplateRenderer;

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
        ingest_type = ?config.ingest_type,
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
    let delivery_router = Arc::new(DeliveryRouter::new(subscriber_cache, template_renderer));

    // Create pipeline channels
    let (tick_tx, tick_rx) = tokio::sync::mpsc::channel(config.buffer_size);
    let (delivery_tx, delivery_rx) = tokio::sync::mpsc::channel(4096);

    let stats = Arc::new(PipelineStats::new());

    // Create ingest source
    let ingest_source: Box<dyn IngestSource> = match config.ingest_type {
        IngestType::Redis => Box::new(RedisQueueSource::new(
            config.redis_url.clone(),
            config.redis_queue_key.clone(),
        )),
        IngestType::Websocket => {
            let ws_url = config
                .ws_url
                .clone()
                .context("NOTIFLO_WS_URL required when ingest_type=websocket")?;
            Box::new(WebSocketSource::new(ws_url, config.ws_reconnect_ms))
        }
    };

    info!("All components initialized. Starting pipeline...");

    // Spawn all concurrent tasks
    let ingest_handle = tokio::spawn(pipeline::run_ingest(ingest_source, tick_tx, stats.clone()));

    let eval_handle = tokio::spawn(pipeline::run_evaluator(
        tick_rx,
        store.clone(),
        delivery_tx,
        stats.clone(),
    ));

    let delivery_handle = tokio::spawn(delivery::run_delivery(
        delivery_rx,
        delivery_router,
        http_provider,
        event_log,
        dead_letter,
    ));

    let config_poll_handle = tokio::spawn(async move {
        config_loader.poll_loop().await;
    });

    let health_handle = tokio::spawn(health::serve_health(config.health_port, stats.clone()));

    info!(
        health_port = config.health_port,
        "Notiflo Runtime is running"
    );

    // Wait for any task to complete (they should all run forever)
    tokio::select! {
        r = ingest_handle => {
            tracing::error!("Ingest task exited: {:?}", r);
        }
        r = eval_handle => {
            tracing::error!("Evaluator task exited: {:?}", r);
        }
        r = delivery_handle => {
            tracing::error!("Delivery task exited: {:?}", r);
        }
        r = config_poll_handle => {
            tracing::error!("Config poll task exited: {:?}", r);
        }
        r = health_handle => {
            tracing::error!("Health server exited: {:?}", r);
        }
    }

    Ok(())
}
