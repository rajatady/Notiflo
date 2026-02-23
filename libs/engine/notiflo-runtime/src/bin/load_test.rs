//! Standalone load test for the Notiflo hot path.
//!
//! Tests the full pipeline: evaluate → render → HTTP deliver → event log
//! against real Redis and a local wiremock server.
//!
//! Usage:
//!   cargo run --bin load_test --release -- [OPTIONS]
//!
//! Options:
//!   --conditions <N>      Number of alert conditions to load (default: 10000)
//!   --symbols <N>         Number of distinct symbols (default: 100)
//!   --ticks <N>           Number of ticks to process (default: 50000)
//!   --concurrency <N>     Concurrent delivery workers (default: 8)
//!   --redis-url <URL>     Redis URL for event log (default: redis://localhost:6379)
//!   --skip-delivery       Skip HTTP delivery (benchmark evaluate+render only)
//!   --skip-event-log      Skip Redis event log

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use clap::Parser;
use crossbeam_channel::bounded;

use engine_core::condition::evaluator::StrategyRegistry;
use engine_core::condition::expression_strategy::ExpressionStrategy;
use engine_core::condition::script_strategy::ScriptStrategy;
use engine_core::condition::store::ConditionStore;
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;
use shared_types::{AlertCondition, DeliveryRequest, NormalizedTick};

use notiflo_runtime_lib::delivery::http_provider::{HttpProvider, ProviderConfig};
use notiflo_runtime_lib::event_log::EventLog;
use notiflo_runtime_lib::template::TemplateRenderer;

#[derive(Parser)]
#[command(name = "notiflo-load-test", about = "Hot path load test")]
struct Args {
    /// Number of alert conditions
    #[arg(long, default_value = "10000")]
    conditions: usize,

    /// Number of distinct symbols
    #[arg(long, default_value = "100")]
    symbols: usize,

    /// Number of ticks to process
    #[arg(long, default_value = "50000")]
    ticks: usize,

    /// Concurrent delivery workers
    #[arg(long, default_value = "8")]
    concurrency: usize,

    /// Redis URL for event log
    #[arg(long, default_value = "redis://localhost:6379")]
    redis_url: String,

    /// Skip HTTP delivery
    #[arg(long)]
    skip_delivery: bool,

    /// Skip Redis event log
    #[arg(long)]
    skip_event_log: bool,
}

fn make_condition(id: usize, symbol: &str, threshold: f64) -> AlertCondition {
    AlertCondition {
        id: format!("load-{}", id),
        organization_id: "org-load".to_string(),
        subscriber_id: format!("sub-{}", id % 1000),
        symbol: symbol.to_string(),
        strategy_type: "threshold_crossing".to_string(),
        strategy_params: serde_json::json!({
            "threshold": threshold,
            "operator": "cross_above",
        }),
        channels: vec!["email".to_string()],
        template_id: None,
        active: true,
        cooldown_ms: None,
        last_triggered_us: None,
    }
}

struct Stats {
    ticks_processed: AtomicU64,
    matches_found: AtomicU64,
    deliveries_sent: AtomicU64,
    events_logged: AtomicU64,
    delivery_errors: AtomicU64,
    total_evaluate_ns: AtomicU64,
    total_render_ns: AtomicU64,
    total_deliver_ns: AtomicU64,
    total_event_log_ns: AtomicU64,
}

impl Stats {
    fn new() -> Self {
        Self {
            ticks_processed: AtomicU64::new(0),
            matches_found: AtomicU64::new(0),
            deliveries_sent: AtomicU64::new(0),
            events_logged: AtomicU64::new(0),
            delivery_errors: AtomicU64::new(0),
            total_evaluate_ns: AtomicU64::new(0),
            total_render_ns: AtomicU64::new(0),
            total_deliver_ns: AtomicU64::new(0),
            total_event_log_ns: AtomicU64::new(0),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    println!("╔══════════════════════════════════════════════════╗");
    println!("║        Notiflo Hot Path Load Test                ║");
    println!("╠══════════════════════════════════════════════════╣");
    println!("║ Conditions:  {:>8}                           ║", args.conditions);
    println!("║ Symbols:     {:>8}                           ║", args.symbols);
    println!("║ Ticks:       {:>8}                           ║", args.ticks);
    println!("║ Concurrency: {:>8}                           ║", args.concurrency);
    println!("║ Delivery:    {:>8}                           ║", if args.skip_delivery { "SKIP" } else { "ON" });
    println!("║ Event Log:   {:>8}                           ║", if args.skip_event_log { "SKIP" } else { "ON" });
    println!("╚══════════════════════════════════════════════════╝");
    println!();

    // ── Setup evaluation engine ──────────────────────────────────────
    print!("Loading {} conditions across {} symbols... ", args.conditions, args.symbols);
    let setup_start = Instant::now();

    let mut registry = StrategyRegistry::new();
    registry.register(Arc::new(ThresholdCrossingStrategy::new()));
    registry.register(Arc::new(ExpressionStrategy::new()));
    registry.register(Arc::new(ScriptStrategy::new()));

    let (match_tx, _match_rx) = bounded(1_000_000);
    let store = Arc::new(ConditionStore::new(Arc::new(registry), match_tx));

    for i in 0..args.conditions {
        let symbol = format!("SYM{:04}", i % args.symbols);
        let threshold = 100.0 + (i as f64 / args.conditions as f64) * 100.0;
        store.add_condition(&make_condition(i, &symbol, threshold));
    }

    // Initialize all symbols at baseline
    for s in 0..args.symbols {
        let symbol = format!("SYM{:04}", s);
        store.evaluate(&NormalizedTick::numeric(symbol, 149.0, 0));
    }

    println!("done ({:.1}ms)", setup_start.elapsed().as_secs_f64() * 1000.0);

    // ── Setup wiremock delivery server ───────────────────────────────
    let provider = Arc::new(HttpProvider::new());
    if !args.skip_delivery {
        print!("Starting mock delivery server... ");
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "id": "msg-load" })),
            )
            .mount(&mock_server)
            .await;

        provider.set_config(ProviderConfig {
            organization_id: "org-load".to_string(),
            channel: "email".to_string(),
            provider: "mock".to_string(),
            endpoint: format!("{}/deliver", mock_server.uri()),
            auth_header: None,
            timeout_ms: 5000,
        });

        // Keep mock server alive
        std::mem::forget(mock_server);
        println!("done");
    }

    // ── Setup event log ──────────────────────────────────────────────
    let event_log = if !args.skip_event_log {
        print!("Connecting to Redis for event log... ");
        match EventLog::new(&args.redis_url).await {
            Ok(el) => {
                el.ensure_consumer_group().await?;
                println!("done");
                Some(Arc::new(el))
            }
            Err(e) => {
                println!("FAILED ({}), skipping event log", e);
                None
            }
        }
    } else {
        None
    };

    let renderer = Arc::new(TemplateRenderer::new(None));
    let stats = Arc::new(Stats::new());

    // ── Run the load test ────────────────────────────────────────────
    println!();
    println!("Running {} ticks through the hot path...", args.ticks);
    println!();

    let overall_start = Instant::now();

    // Generate all ticks upfront to avoid measuring tick creation time
    let ticks: Vec<NormalizedTick> = (0..args.ticks)
        .map(|i| {
            let symbol = format!("SYM{:04}", i % args.symbols);
            // Alternate: 60% trigger matches, 40% no match
            let value = if i % 5 < 3 { 151.0 } else { 149.5 };
            NormalizedTick::numeric(symbol, value, i as u64 + 1)
        })
        .collect();

    // Process ticks with concurrent delivery workers
    let (tx, rx) = tokio::sync::mpsc::channel::<(Vec<shared_types::ConditionMatch>, u64)>(4096);
    let rx = Arc::new(tokio::sync::Mutex::new(rx));

    // Spawn delivery workers
    let mut worker_handles = Vec::new();
    for _w in 0..args.concurrency {
        let rx = rx.clone();
        let provider = provider.clone();
        let event_log = event_log.clone();
        let renderer = renderer.clone();
        let stats = stats.clone();
        let skip_delivery = args.skip_delivery;
        let skip_event_log = args.skip_event_log || event_log.is_none();

        worker_handles.push(tokio::spawn(async move {
            loop {
                let item = {
                    let mut guard = rx.lock().await;
                    guard.recv().await
                };
                match item {
                    Some((matches, _ts)) => {
                        for m in matches {
                            for channel in &m.channels {
                                // Render
                                let render_start = Instant::now();
                                let content = renderer
                                    .render_for_match(&m, channel, "user@load-test.com")
                                    .await;
                                stats.total_render_ns.fetch_add(
                                    render_start.elapsed().as_nanos() as u64,
                                    Ordering::Relaxed,
                                );

                                let request = DeliveryRequest {
                                    id: format!("req-{}", m.condition_id),
                                    condition_match_id: m.condition_id.clone(),
                                    organization_id: m.organization_id.clone(),
                                    subscriber_id: m.subscriber_id.clone(),
                                    channel: channel.clone(),
                                    provider: "mock".to_string(),
                                    rendered_content: content,
                                    timestamp_us: m.timestamp_us,
                                };

                                // Deliver
                                if !skip_delivery {
                                    let deliver_start = Instant::now();
                                    let result = provider.send_with_retry(&request).await;
                                    stats.total_deliver_ns.fetch_add(
                                        deliver_start.elapsed().as_nanos() as u64,
                                        Ordering::Relaxed,
                                    );
                                    stats.deliveries_sent.fetch_add(1, Ordering::Relaxed);
                                    if !result.success {
                                        stats.delivery_errors.fetch_add(1, Ordering::Relaxed);
                                    }

                                    // Event log
                                    if !skip_event_log {
                                        if let Some(ref el) = event_log {
                                            let log_start = Instant::now();
                                            let _ = el.log_delivery(&result, None).await;
                                            stats.total_event_log_ns.fetch_add(
                                                log_start.elapsed().as_nanos() as u64,
                                                Ordering::Relaxed,
                                            );
                                            stats.events_logged.fetch_add(1, Ordering::Relaxed);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    None => break,
                }
            }
        }));
    }

    // Main evaluation loop (single-threaded — same as production)
    let eval_start = Instant::now();
    for tick in ticks {
        let t0 = Instant::now();
        let matches = store.evaluate(&tick);
        stats
            .total_evaluate_ns
            .fetch_add(t0.elapsed().as_nanos() as u64, Ordering::Relaxed);
        stats.ticks_processed.fetch_add(1, Ordering::Relaxed);

        if !matches.is_empty() {
            stats
                .matches_found
                .fetch_add(matches.len() as u64, Ordering::Relaxed);
            let _ = tx.send((matches, tick.timestamp_us)).await;
        }
    }
    let eval_elapsed = eval_start.elapsed();

    // Close channel and wait for workers to drain
    drop(tx);
    for h in worker_handles {
        let _ = h.await;
    }

    let overall_elapsed = overall_start.elapsed();

    // ── Report results ───────────────────────────────────────────────
    let ticks = stats.ticks_processed.load(Ordering::Relaxed);
    let matches = stats.matches_found.load(Ordering::Relaxed);
    let deliveries = stats.deliveries_sent.load(Ordering::Relaxed);
    let events = stats.events_logged.load(Ordering::Relaxed);
    let errors = stats.delivery_errors.load(Ordering::Relaxed);
    let eval_ns = stats.total_evaluate_ns.load(Ordering::Relaxed);
    let render_ns = stats.total_render_ns.load(Ordering::Relaxed);
    let deliver_ns = stats.total_deliver_ns.load(Ordering::Relaxed);
    let log_ns = stats.total_event_log_ns.load(Ordering::Relaxed);

    println!("╔══════════════════════════════════════════════════╗");
    println!("║              LOAD TEST RESULTS                  ║");
    println!("╠══════════════════════════════════════════════════╣");
    println!("║                                                  ║");
    println!("║  Throughput                                      ║");
    println!("║  ──────────                                      ║");
    println!(
        "║  Ticks/sec:     {:>12.0}                     ║",
        ticks as f64 / eval_elapsed.as_secs_f64()
    );
    println!(
        "║  Total time:    {:>12.2}s                    ║",
        overall_elapsed.as_secs_f64()
    );
    println!(
        "║  Eval time:     {:>12.2}s                    ║",
        eval_elapsed.as_secs_f64()
    );
    println!("║                                                  ║");
    println!("║  Counts                                          ║");
    println!("║  ──────                                          ║");
    println!("║  Ticks:         {:>12}                     ║", ticks);
    println!("║  Matches:       {:>12}                     ║", matches);
    println!("║  Deliveries:    {:>12}                     ║", deliveries);
    println!("║  Events logged: {:>12}                     ║", events);
    println!("║  Errors:        {:>12}                     ║", errors);
    println!("║                                                  ║");
    println!("║  Latency (avg per operation)                     ║");
    println!("║  ──────────────────────────                      ║");
    if ticks > 0 {
        println!(
            "║  Evaluate:      {:>12.0}ns                   ║",
            eval_ns as f64 / ticks as f64
        );
    }
    if matches > 0 {
        println!(
            "║  Render:        {:>12.0}ns                   ║",
            render_ns as f64 / matches as f64
        );
    }
    if deliveries > 0 {
        println!(
            "║  Deliver:       {:>8.2}ms                   ║",
            deliver_ns as f64 / deliveries as f64 / 1_000_000.0
        );
    }
    if events > 0 {
        println!(
            "║  Event log:     {:>8.2}ms                   ║",
            log_ns as f64 / events as f64 / 1_000_000.0
        );
    }
    println!("║                                                  ║");
    println!("╚══════════════════════════════════════════════════╝");

    // Clean up Redis test stream
    if !args.skip_event_log && event_log.is_some() {
        println!("\nCleaning up Redis test stream...");
        let client = redis::Client::open(args.redis_url.as_str())?;
        let mut conn = client.get_multiplexed_async_connection().await?;
        let _: redis::RedisResult<()> = redis::cmd("DEL")
            .arg("notiflo:events:delivery")
            .query_async(&mut conn)
            .await;
    }

    Ok(())
}
