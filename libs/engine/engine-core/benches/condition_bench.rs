use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;
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

/// Benchmark threshold crossing: no-match case (within sentinels)
fn bench_threshold_no_match(c: &mut Criterion) {
    let mut group = c.benchmark_group("threshold_no_match");

    for count in [100, 1_000, 10_000, 100_000] {
        let strategy = ThresholdCrossingStrategy::new();

        // Add conditions with thresholds spread across 100-200 range
        for i in 0..count {
            let threshold = 100.0 + (i as f64 / count as f64) * 100.0;
            strategy.add_condition(&make_threshold_condition(i, "AAPL", threshold));
        }

        // Set initial price
        let init_tick = NormalizedTick::numeric("AAPL".into(), 150.0, 0);
        strategy.evaluate(&init_tick);

        // Tick within sentinels — should be O(1) no-op
        let tick = NormalizedTick::numeric("AAPL".into(), 150.001, 1000);

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

/// Benchmark threshold crossing: match case (crossing a sentinel)
fn bench_threshold_match(c: &mut Criterion) {
    let strategy = ThresholdCrossingStrategy::new();

    // 10K conditions with thresholds at 100.01, 100.02, ..., 200.00
    for i in 0..10_000 {
        let threshold = 100.0 + (i as f64 + 1.0) * 0.01;
        strategy.add_condition(&make_threshold_condition(i, "AAPL", threshold));
    }

    // Set initial price
    strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 150.0, 0));

    // Cross one threshold
    let tick = NormalizedTick::numeric("AAPL".into(), 150.02, 1000);

    c.bench_function("threshold_single_match_10k_conditions", |b| {
        // Reset price before each iteration
        strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 150.0, 999));
        b.iter(|| {
            black_box(strategy.evaluate(&tick));
        });
    });
}

/// Benchmark expression strategy evaluation
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

/// Benchmark script strategy evaluation
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

/// Benchmark multi-symbol throughput
fn bench_multi_symbol_throughput(c: &mut Criterion) {
    let strategy = ThresholdCrossingStrategy::new();

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
            // Tick a random symbol within sentinels
            let symbol = format!("SYM{:04}", ts % 1000);
            let tick = NormalizedTick::numeric(symbol, 150.001, ts);
            ts += 1;
            black_box(strategy.evaluate(&tick));
        });
    });
}

criterion_group!(
    benches,
    bench_threshold_no_match,
    bench_threshold_match,
    bench_expression,
    bench_script,
    bench_multi_symbol_throughput,
);
criterion_main!(benches);
