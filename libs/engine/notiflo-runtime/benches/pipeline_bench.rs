use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use crossbeam_channel::bounded;
use std::sync::Arc;

use engine_core::condition::evaluator::StrategyRegistry;
use engine_core::condition::expression_strategy::ExpressionStrategy;
use engine_core::condition::script_strategy::ScriptStrategy;
use engine_core::condition::store::ConditionStore;
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;
use shared_types::{AlertCondition, NormalizedTick};

fn make_condition(id: usize, symbol: &str, strategy: &str, threshold: f64) -> AlertCondition {
    AlertCondition {
        id: format!("bench-{}", id),
        organization_id: "org-bench".to_string(),
        subscriber_id: format!("sub-{}", id % 1000),
        symbol: symbol.to_string(),
        strategy_type: strategy.to_string(),
        strategy_params: match strategy {
            "threshold_crossing" => serde_json::json!({
                "threshold": threshold,
                "operator": "cross_above",
            }),
            "expression" => serde_json::json!({
                "expression": format!("value > {}", threshold),
            }),
            "script" => serde_json::json!({
                "script": format!("value > {}", threshold),
            }),
            _ => serde_json::json!({}),
        },
        channels: vec!["email".to_string()],
        template_id: None,
        active: true,
        cooldown_ms: None,
        last_triggered_us: None,
    }
}

fn make_store(strategies: Vec<&str>) -> Arc<ConditionStore> {
    let mut registry = StrategyRegistry::new();
    for s in strategies {
        match s {
            "threshold_crossing" => registry.register(Arc::new(ThresholdCrossingStrategy::new())),
            "expression" => registry.register(Arc::new(ExpressionStrategy::new())),
            "script" => registry.register(Arc::new(ScriptStrategy::new())),
            _ => {}
        }
    }
    let (tx, _rx) = bounded(1_000_000);
    Arc::new(ConditionStore::new(Arc::new(registry), tx))
}

// ─── Evaluate throughput at different condition counts ─────────────────────

fn bench_evaluate_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("evaluate_throughput");

    for count in [1_000usize, 10_000, 100_000] {
        let store = make_store(vec!["threshold_crossing"]);
        let num_symbols: usize = 100;

        for i in 0..count {
            let symbol = format!("SYM{:04}", i % num_symbols);
            store.add_condition(&make_condition(i, &symbol, "threshold_crossing", 150.0));
        }

        // Initialize baseline
        for s in 0..num_symbols {
            let symbol = format!("SYM{:04}", s);
            store.evaluate(&NormalizedTick::numeric(symbol, 149.0, 0));
        }

        group.throughput(Throughput::Elements(1));
        group.bench_with_input(
            BenchmarkId::new("threshold_only", count),
            &count,
            |b, _| {
                let mut ts = 1u64;
                b.iter(|| {
                    let symbol = format!("SYM{:04}", ts as usize % num_symbols);
                    let tick = NormalizedTick::numeric(symbol, 151.0, ts);
                    ts += 1;
                    black_box(store.evaluate(&tick));
                });
            },
        );
    }
    group.finish();
}

// ─── Mixed strategy benchmark ─────────────────────────────────────────────

fn bench_multi_strategy_mix(c: &mut Criterion) {
    let mut group = c.benchmark_group("multi_strategy_mix");
    let store = make_store(vec!["threshold_crossing", "expression", "script"]);
    let num_symbols: usize = 50;
    let total = 1000;

    for i in 0..total {
        let symbol = format!("MIX{:04}", i % num_symbols);
        let strategy = if i % 10 < 7 {
            "threshold_crossing"
        } else if i % 10 < 9 {
            "expression"
        } else {
            "script"
        };
        store.add_condition(&make_condition(i, &symbol, strategy, 150.0));
    }

    for s in 0..num_symbols {
        let symbol = format!("MIX{:04}", s);
        store.evaluate(&NormalizedTick::numeric(symbol, 149.0, 0));
    }

    group.throughput(Throughput::Elements(1));
    group.bench_function("1000_mixed_conditions", |b| {
        let mut ts = 1u64;
        b.iter(|| {
            let symbol = format!("MIX{:04}", ts as usize % num_symbols);
            let tick = NormalizedTick::numeric(symbol, 151.0, ts);
            ts += 1;
            black_box(store.evaluate(&tick));
        });
    });

    group.finish();
}

// ─── Single-symbol worst-case scaling ─────────────────────────────────────

fn bench_scaling(c: &mut Criterion) {
    let mut group = c.benchmark_group("single_symbol_scaling");

    for count in [100usize, 1_000, 5_000, 10_000, 50_000] {
        let store = make_store(vec!["threshold_crossing"]);
        for i in 0..count {
            let threshold = 100.0 + (i as f64 / count as f64) * 100.0;
            store.add_condition(&make_condition(i, "SCALE", "threshold_crossing", threshold));
        }
        store.evaluate(&NormalizedTick::numeric("SCALE".into(), 150.0, 0));

        group.throughput(Throughput::Elements(1));
        group.bench_with_input(
            BenchmarkId::new("conditions", count),
            &count,
            |b, _| {
                let mut ts = 1u64;
                b.iter(|| {
                    let tick = NormalizedTick::numeric("SCALE".into(), 150.001, ts);
                    ts += 1;
                    black_box(store.evaluate(&tick));
                });
            },
        );
    }

    group.finish();
}

// ─── Template rendering benchmark ─────────────────────────────────────────

fn bench_template_render(c: &mut Criterion) {
    use notiflo_runtime_lib::template::TemplateRenderer;
    use shared_types::ConditionMatch;

    let renderer = TemplateRenderer::new(None);
    let condition_match = ConditionMatch {
        condition_id: "cond-bench".to_string(),
        organization_id: "org-bench".to_string(),
        subscriber_id: "sub-bench".to_string(),
        symbol: "AAPL".to_string(),
        matched_value: 155.5,
        channels: vec!["email".to_string(), "sms".to_string()],
        template_id: None,
        match_detail: Some("crossed above 150.0".to_string()),
        timestamp_us: 1700000000000000,
    };

    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("template_render");
    group.throughput(Throughput::Elements(1));

    // Default payload (no template cache hit — most common hot path)
    group.bench_function("default_payload", |b| {
        b.iter(|| {
            rt.block_on(async {
                black_box(
                    renderer
                        .render_for_match(&condition_match, "email", "user@test.com")
                        .await,
                );
            });
        });
    });

    group.finish();
}

// ─── HTTP delivery benchmark (wiremock) ───────────────────────────────────

fn bench_http_delivery(c: &mut Criterion) {
    use notiflo_runtime_lib::delivery::http_provider::{HttpProvider, ProviderConfig};
    use shared_types::DeliveryRequest;

    let rt = tokio::runtime::Runtime::new().unwrap();

    // Start wiremock inside the runtime
    let (provider, request) = rt.block_on(async {
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/deliver"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "id": "msg-bench" })),
            )
            .mount(&mock_server)
            .await;

        let provider = HttpProvider::new();
        provider.set_config(ProviderConfig {
            organization_id: "org-bench".to_string(),
            channel: "email".to_string(),
            provider: "sendgrid".to_string(),
            endpoint: format!("{}/deliver", mock_server.uri()),
            auth_header: Some("Bearer bench-token".to_string()),
            timeout_ms: 5000,
        });

        let request = DeliveryRequest {
            id: "req-bench".to_string(),
            condition_match_id: "match-bench".to_string(),
            organization_id: "org-bench".to_string(),
            subscriber_id: "sub-bench".to_string(),
            channel: "email".to_string(),
            provider: "sendgrid".to_string(),
            rendered_content: serde_json::json!({
                "subject": "Alert: AAPL crossed above 150.0",
                "body": "AAPL matched at value 155.5",
                "to": "user@test.com",
            }),
            timestamp_us: 1700000000000000,
        };

        // Leak to keep mock server alive for the entire benchmark
        // (wiremock server drops when the MockServer value drops)
        let provider = Box::leak(Box::new(provider));
        let mock_server = Box::leak(Box::new(mock_server));
        let _ = mock_server; // keep alive
        (&*provider, request)
    });

    let mut group = c.benchmark_group("http_delivery");
    group.throughput(Throughput::Elements(1));
    // Limit sample count — network I/O benchmarks are noisy
    group.sample_size(50);

    group.bench_function("single_post_with_auth", |b| {
        b.iter(|| {
            rt.block_on(async {
                black_box(provider.send_with_retry(&request).await);
            });
        });
    });

    group.finish();
}

// ─── Full hot-path pipeline: evaluate → render → deliver ──────────────────

fn bench_full_hotpath(c: &mut Criterion) {
    use notiflo_runtime_lib::delivery::http_provider::{HttpProvider, ProviderConfig};
    use notiflo_runtime_lib::template::TemplateRenderer;
    use shared_types::DeliveryRequest;

    let rt = tokio::runtime::Runtime::new().unwrap();

    // Setup: store with 10K conditions, wiremock server, template renderer
    let store = make_store(vec!["threshold_crossing"]);
    let num_symbols = 100usize;
    for i in 0..10_000 {
        let symbol = format!("HP{:04}", i % num_symbols);
        store.add_condition(&make_condition(i, &symbol, "threshold_crossing", 150.0));
    }
    for s in 0..num_symbols {
        store.evaluate(&NormalizedTick::numeric(format!("HP{:04}", s), 149.0, 0));
    }

    let renderer = TemplateRenderer::new(None);

    let (provider, mock_uri) = rt.block_on(async {
        let mock_server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "id": "msg-hp" })),
            )
            .mount(&mock_server)
            .await;

        let uri = mock_server.uri();
        let provider = HttpProvider::new();
        provider.set_config(ProviderConfig {
            organization_id: "org-bench".to_string(),
            channel: "email".to_string(),
            provider: "sendgrid".to_string(),
            endpoint: format!("{}/deliver", uri),
            auth_header: None,
            timeout_ms: 5000,
        });

        let provider = Box::leak(Box::new(provider));
        let _mock = Box::leak(Box::new(mock_server));
        (&*provider, uri)
    });
    let _ = mock_uri;

    let mut group = c.benchmark_group("full_hotpath");
    group.throughput(Throughput::Elements(1));
    group.sample_size(50);

    group.bench_function("evaluate_render_deliver", |b| {
        let mut ts = 1u64;
        b.iter(|| {
            let symbol = format!("HP{:04}", ts as usize % num_symbols);
            let tick = NormalizedTick::numeric(symbol, 151.0, ts);
            ts += 1;

            // Step 1: Evaluate
            let matches = store.evaluate(&tick);

            // Step 2: Render + Deliver for each match
            if !matches.is_empty() {
                rt.block_on(async {
                    for m in &matches {
                        for channel in &m.channels {
                            // Render template
                            let content = renderer
                                .render_for_match(m, channel, "user@test.com")
                                .await;

                            // Build delivery request
                            let request = DeliveryRequest {
                                id: format!("req-{}", ts),
                                condition_match_id: m.condition_id.clone(),
                                organization_id: m.organization_id.clone(),
                                subscriber_id: m.subscriber_id.clone(),
                                channel: channel.clone(),
                                provider: "sendgrid".to_string(),
                                rendered_content: content,
                                timestamp_us: m.timestamp_us,
                            };

                            // Deliver
                            black_box(provider.send_with_retry(&request).await);
                        }
                    }
                });
            }
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_evaluate_throughput,
    bench_multi_strategy_mix,
    bench_scaling,
    bench_template_render,
    bench_http_delivery,
    bench_full_hotpath,
);
criterion_main!(benches);
