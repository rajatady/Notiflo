use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use engine_core::condition::threshold_crossing::{ThresholdAlgorithm, ThresholdCrossingStrategy};
use engine_core::condition::expression_strategy::ExpressionStrategy;
use engine_core::condition::script_strategy::ScriptStrategy;
use shared_types::{AlertCondition, EvaluationStrategy, NormalizedTick};

fn make_threshold_condition(id: usize, symbol: &str, threshold: f64) -> AlertCondition {
    AlertCondition {
        id: format!("cond-{}", id),
        organization_id: "org-bench".to_string(),
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

fn make_expression_condition(id: usize, symbol: &str) -> AlertCondition {
    AlertCondition {
        id: format!("expr-{}", id),
        organization_id: "org-bench".to_string(),
        subscriber_id: format!("sub-{}", id % 1000),
        symbol: symbol.to_string(),
        strategy_type: "expression".to_string(),
        strategy_params: serde_json::json!({
            "expression": "value > 150.0 AND secondary_value > 1000000.0",
        }),
        channels: vec!["email".to_string()],
        template_id: None,
        active: true,
        cooldown_ms: None,
        last_triggered_us: None,
    }
}

fn make_script_condition(id: usize, symbol: &str) -> AlertCondition {
    AlertCondition {
        id: format!("script-{}", id),
        organization_id: "org-bench".to_string(),
        subscriber_id: format!("sub-{}", id % 1000),
        symbol: symbol.to_string(),
        strategy_type: "script".to_string(),
        strategy_params: serde_json::json!({
            "script": "value > 150.0 && volume > 1_000_000.0",
        }),
        channels: vec!["email".to_string()],
        template_id: None,
        active: true,
        cooldown_ms: None,
        last_triggered_us: None,
    }
}

/// Helper: create a strategy with N conditions on AAPL, thresholds spread across [100, 200].
fn setup_strategy(algo: ThresholdAlgorithm, count: usize) -> ThresholdCrossingStrategy {
    let strategy = ThresholdCrossingStrategy::with_algorithm(algo);
    for i in 0..count {
        let threshold = 100.0 + (i as f64 / count as f64) * 100.0;
        strategy.add_condition(&make_threshold_condition(i, "AAPL", threshold));
    }
    // Set initial price
    strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 150.0, 0));
    strategy
}

// ─── Algorithm comparison benchmarks ─────────────────────────────────────

/// No-match (within sentinels): DriftSentinel vs BinarySearch
fn bench_algo_no_match(c: &mut Criterion) {
    let mut group = c.benchmark_group("algo_no_match");

    for count in [100, 1_000, 10_000, 100_000] {
        for algo in [ThresholdAlgorithm::DriftSentinel, ThresholdAlgorithm::BinarySearch] {
            let label = match algo {
                ThresholdAlgorithm::DriftSentinel => "drift_sentinel",
                ThresholdAlgorithm::BinarySearch => "binary_search",
            };
            let strategy = setup_strategy(algo, count);
            let tick = NormalizedTick::numeric("AAPL".into(), 150.001, 1000);

            group.bench_with_input(
                BenchmarkId::new(label, count),
                &count,
                |b, _| {
                    b.iter(|| {
                        black_box(strategy.evaluate(&tick));
                    });
                },
            );
        }
    }

    group.finish();
}

/// Single crossing: DriftSentinel vs BinarySearch
fn bench_algo_single_crossing(c: &mut Criterion) {
    let mut group = c.benchmark_group("algo_single_crossing");

    for count in [100, 1_000, 10_000, 100_000] {
        for algo in [ThresholdAlgorithm::DriftSentinel, ThresholdAlgorithm::BinarySearch] {
            let label = match algo {
                ThresholdAlgorithm::DriftSentinel => "drift_sentinel",
                ThresholdAlgorithm::BinarySearch => "binary_search",
            };
            let strategy = setup_strategy(algo, count);

            group.bench_with_input(
                BenchmarkId::new(label, count),
                &count,
                |b, _| {
                    // Reset price, then cross one threshold
                    strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 150.0, 999));
                    let tick = NormalizedTick::numeric("AAPL".into(), 150.02, 1000);
                    b.iter(|| {
                        black_box(strategy.evaluate(&tick));
                    });
                },
            );
        }
    }

    group.finish();
}

/// Oscillating price (repeated crossings): DriftSentinel vs BinarySearch
/// This tests the index-carry advantage — after a crossing the drift sentinel
/// should recompute in O(1) amortized, while binary search always costs O(log n).
fn bench_algo_oscillating(c: &mut Criterion) {
    let mut group = c.benchmark_group("algo_oscillating");

    for count in [1_000, 10_000, 100_000] {
        for algo in [ThresholdAlgorithm::DriftSentinel, ThresholdAlgorithm::BinarySearch] {
            let label = match algo {
                ThresholdAlgorithm::DriftSentinel => "drift_sentinel",
                ThresholdAlgorithm::BinarySearch => "binary_search",
            };
            let strategy = setup_strategy(algo, count);

            // Oscillate: 149.9 → 150.1 → 149.9 → 150.1 ...
            // Each oscillation crosses 1-2 thresholds
            group.bench_with_input(
                BenchmarkId::new(label, count),
                &count,
                |b, _| {
                    let mut toggle = false;
                    let mut ts = 1000u64;
                    b.iter(|| {
                        let price = if toggle { 150.1 } else { 149.9 };
                        toggle = !toggle;
                        ts += 1;
                        let tick = NormalizedTick::numeric("AAPL".into(), price, ts);
                        black_box(strategy.evaluate(&tick));
                    });
                },
            );
        }
    }

    group.finish();
}

/// Streaming local-continuity simulation: small random walks around threshold region.
/// This is the realistic scenario described in the paper — prices drift locally,
/// occasionally crossing thresholds, and the sentinel drifts with them.
fn bench_algo_local_continuity(c: &mut Criterion) {
    let mut group = c.benchmark_group("algo_local_continuity");

    for count in [1_000, 10_000, 100_000] {
        for algo in [ThresholdAlgorithm::DriftSentinel, ThresholdAlgorithm::BinarySearch] {
            let label = match algo {
                ThresholdAlgorithm::DriftSentinel => "drift_sentinel",
                ThresholdAlgorithm::BinarySearch => "binary_search",
            };
            let strategy = setup_strategy(algo, count);

            // Pre-generate a random walk using a simple LCG (deterministic)
            let walk_len = 10_000;
            let mut prices = Vec::with_capacity(walk_len);
            let mut price = 150.0f64;
            let mut rng_state = 42u64;
            for _ in 0..walk_len {
                rng_state = rng_state.wrapping_mul(6364136223846793005).wrapping_add(1);
                // Map to [-0.05, +0.05] step
                let step = ((rng_state >> 33) as f64 / u32::MAX as f64 - 0.5) * 0.1;
                price += step;
                prices.push(price);
            }

            group.bench_with_input(
                BenchmarkId::new(label, count),
                &count,
                |b, _| {
                    let mut idx = 0usize;
                    b.iter(|| {
                        let tick = NormalizedTick::numeric("AAPL".into(), prices[idx % walk_len], idx as u64);
                        idx += 1;
                        black_box(strategy.evaluate(&tick));
                    });
                },
            );
        }
    }

    group.finish();
}

// ─── Strategy comparison benchmarks (expression, script) ─────────────────

fn bench_expression(c: &mut Criterion) {
    let mut group = c.benchmark_group("expression_eval");

    for count in [100, 1_000, 10_000] {
        let strategy = ExpressionStrategy::new();
        for i in 0..count {
            strategy.add_condition(&make_expression_condition(i, "AAPL"));
        }

        let tick = NormalizedTick {
            symbol: "AAPL".into(),
            value: 151.0,
            secondary_value: Some(2_000_000.0),
            text_content: None,
            timestamp_us: 1000,
            metadata: None,
        };

        group.bench_with_input(
            BenchmarkId::from_parameter(count),
            &count,
            |b, _| {
                b.iter(|| {
                    black_box(strategy.evaluate(&tick));
                });
            },
        );
    }

    group.finish();
}

fn bench_script(c: &mut Criterion) {
    let mut group = c.benchmark_group("script_eval");

    for count in [10, 100, 1_000] {
        let strategy = ScriptStrategy::new();
        for i in 0..count {
            strategy.add_condition(&make_script_condition(i, "AAPL"));
        }

        let tick = NormalizedTick {
            symbol: "AAPL".into(),
            value: 151.0,
            secondary_value: Some(2_000_000.0),
            text_content: None,
            timestamp_us: 1000,
            metadata: None,
        };

        group.bench_with_input(
            BenchmarkId::from_parameter(count),
            &count,
            |b, _| {
                b.iter(|| {
                    black_box(strategy.evaluate(&tick));
                });
            },
        );
    }

    group.finish();
}

/// Multi-symbol throughput with drift sentinel (default)
fn bench_multi_symbol_throughput(c: &mut Criterion) {
    let strategy = ThresholdCrossingStrategy::new(); // DriftSentinel by default

    // 1000 symbols, 100 conditions each = 100K total conditions
    for sym_idx in 0..1_000 {
        let symbol = format!("SYM{:04}", sym_idx);
        for i in 0..100 {
            let threshold = 100.0 + i as f64;
            strategy.add_condition(&make_threshold_condition(
                sym_idx * 100 + i,
                &symbol,
                threshold,
            ));
        }
    }

    // Initialize all symbols
    for sym_idx in 0..1_000 {
        let symbol = format!("SYM{:04}", sym_idx);
        strategy.evaluate(&NormalizedTick::numeric(symbol, 150.0, 0));
    }

    c.bench_function("100k_conditions_1000_symbols_no_match", |b| {
        let mut ts = 1000u64;
        b.iter(|| {
            let symbol = format!("SYM{:04}", ts % 1000);
            let tick = NormalizedTick::numeric(symbol, 150.001, ts);
            ts += 1;
            black_box(strategy.evaluate(&tick));
        });
    });
}

criterion_group!(
    benches,
    bench_algo_no_match,
    bench_algo_single_crossing,
    bench_algo_oscillating,
    bench_algo_local_continuity,
    bench_expression,
    bench_script,
    bench_multi_symbol_throughput,
);
criterion_main!(benches);
