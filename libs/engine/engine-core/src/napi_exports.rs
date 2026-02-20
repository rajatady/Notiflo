use crate::condition::evaluator::StrategyRegistry;
use crate::condition::expression_strategy::ExpressionStrategy;
use crate::condition::script_strategy::ScriptStrategy;
use crate::condition::store::ConditionStore;
use crate::condition::threshold_crossing::ThresholdCrossingStrategy;
use crate::condition::types::{ConditionMatchBatch, EngineConfig};
use crate::metrics::MetricsTracker;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use parking_lot::RwLock;
use shared_types::{AlertCondition, ConditionMatch, NormalizedTick};
use std::sync::Arc;
use std::time::Instant;

/// Global engine state — initialized once via init_engine().
static ENGINE: std::sync::OnceLock<EngineState> = std::sync::OnceLock::new();

struct EngineState {
    store: ConditionStore,
    metrics: MetricsTracker,
    match_callback: RwLock<Option<ThreadsafeFunction<String, ErrorStrategy::Fatal>>>,
    match_receiver: crossbeam_channel::Receiver<ConditionMatchBatch>,
}

// ─── JS-facing types (napi serde) ───────────────────────────────────────

#[napi(object)]
#[derive(Debug, Clone)]
pub struct EngineConfigJs {
    pub evaluation_threads: Option<u32>,
    pub ring_buffer_size: Option<u32>,
    pub default_cooldown_ms: Option<u32>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct AlertConditionJs {
    pub id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    pub symbol: String,
    pub strategy_type: String,
    /// JSON string of strategy-specific params
    pub strategy_params: String,
    pub channels: Vec<String>,
    pub template_id: Option<String>,
    pub active: bool,
    pub cooldown_ms: Option<u32>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct NormalizedTickJs {
    pub symbol: String,
    pub value: f64,
    pub secondary_value: Option<f64>,
    pub text_content: Option<String>,
    pub timestamp_us: f64,
    /// JSON string of metadata
    pub metadata: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ConditionMatchJs {
    pub condition_id: String,
    pub organization_id: String,
    pub subscriber_id: String,
    pub symbol: String,
    pub matched_value: f64,
    pub channels: Vec<String>,
    pub template_id: Option<String>,
    pub timestamp_us: f64,
    pub match_detail: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct EngineMetricsJs {
    pub total_conditions: f64,
    pub total_ticks_processed: f64,
    pub total_matches: f64,
    pub ticks_per_second: f64,
    pub matches_per_second: f64,
    pub avg_evaluation_us: f64,
    pub strategies: Vec<StrategyMetricsJs>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct StrategyMetricsJs {
    pub strategy_type: String,
    pub condition_count: f64,
}

// ─── Conversion helpers ─────────────────────────────────────────────────

fn js_to_condition(js: &AlertConditionJs) -> Result<AlertCondition> {
    let strategy_params: serde_json::Value = serde_json::from_str(&js.strategy_params)
        .map_err(|e| Error::from_reason(format!("Invalid strategy_params JSON: {}", e)))?;

    Ok(AlertCondition {
        id: js.id.clone(),
        organization_id: js.organization_id.clone(),
        subscriber_id: js.subscriber_id.clone(),
        symbol: js.symbol.clone(),
        strategy_type: js.strategy_type.clone(),
        strategy_params,
        channels: js.channels.clone(),
        template_id: js.template_id.clone(),
        active: js.active,
        cooldown_ms: js.cooldown_ms.map(|v| v as u64),
        last_triggered_us: None,
    })
}

fn js_to_tick(js: &NormalizedTickJs) -> Result<NormalizedTick> {
    let metadata = match &js.metadata {
        Some(s) => Some(
            serde_json::from_str(s)
                .map_err(|e| Error::from_reason(format!("Invalid metadata JSON: {}", e)))?,
        ),
        None => None,
    };

    Ok(NormalizedTick {
        symbol: js.symbol.clone(),
        value: js.value,
        secondary_value: js.secondary_value,
        text_content: js.text_content.clone(),
        timestamp_us: js.timestamp_us as u64,
        metadata,
    })
}

fn match_to_js(m: &ConditionMatch) -> ConditionMatchJs {
    ConditionMatchJs {
        condition_id: m.condition_id.clone(),
        organization_id: m.organization_id.clone(),
        subscriber_id: m.subscriber_id.clone(),
        symbol: m.symbol.clone(),
        matched_value: m.matched_value,
        channels: m.channels.clone(),
        template_id: m.template_id.clone(),
        timestamp_us: m.timestamp_us as f64,
        match_detail: m.match_detail.clone(),
    }
}

fn get_engine() -> Result<&'static EngineState> {
    ENGINE
        .get()
        .ok_or_else(|| Error::from_reason("Engine not initialized. Call init_engine() first."))
}

// ─── napi exports ───────────────────────────────────────────────────────

#[napi]
pub fn init_engine(config: Option<EngineConfigJs>) -> Result<()> {
    let _config = config.map(|c| EngineConfig {
        evaluation_threads: c.evaluation_threads,
        ring_buffer_size: c.ring_buffer_size.map(|v| v as usize),
        default_cooldown_ms: c.default_cooldown_ms.map(|v| v as u64),
    }).unwrap_or_default();

    let buffer_size = _config.ring_buffer_size.unwrap_or(65536);
    let (sender, receiver) = crossbeam_channel::bounded(buffer_size);

    let mut registry = StrategyRegistry::new();
    registry.register(Arc::new(ThresholdCrossingStrategy::new()));
    registry.register(Arc::new(ExpressionStrategy::new()));
    registry.register(Arc::new(ScriptStrategy::new()));

    let store = ConditionStore::new(Arc::new(registry), sender);

    let state = EngineState {
        store,
        metrics: MetricsTracker::new(),
        match_callback: RwLock::new(None),
        match_receiver: receiver,
    };

    ENGINE
        .set(state)
        .map_err(|_| Error::from_reason("Engine already initialized"))?;

    Ok(())
}

#[napi]
pub fn add_condition(condition: AlertConditionJs) -> Result<String> {
    let engine = get_engine()?;
    let cond = js_to_condition(&condition)?;
    let id = cond.id.clone();
    if engine.store.add_condition(&cond) {
        Ok(id)
    } else {
        Err(Error::from_reason(format!(
            "No strategy registered for type: {}",
            condition.strategy_type
        )))
    }
}

#[napi]
pub fn remove_condition(condition_id: String) -> Result<bool> {
    let engine = get_engine()?;
    let count_before = engine.store.condition_count();
    engine.store.remove_condition(&condition_id);
    let count_after = engine.store.condition_count();
    Ok(count_after < count_before)
}

#[napi]
pub fn update_condition(condition: AlertConditionJs) -> Result<bool> {
    let engine = get_engine()?;
    let cond = js_to_condition(&condition)?;
    Ok(engine.store.update_condition(&cond))
}

#[napi]
pub fn bulk_load_conditions(conditions: Vec<AlertConditionJs>) -> Result<u32> {
    let engine = get_engine()?;
    let conds: Vec<AlertCondition> = conditions
        .iter()
        .map(js_to_condition)
        .collect::<Result<Vec<_>>>()?;
    Ok(engine.store.bulk_load(&conds))
}

#[napi]
pub fn get_condition_count() -> Result<f64> {
    let engine = get_engine()?;
    Ok(engine.store.condition_count() as f64)
}

#[napi]
pub fn evaluate_tick(tick: NormalizedTickJs) -> Result<Vec<ConditionMatchJs>> {
    let engine = get_engine()?;
    let t = js_to_tick(&tick)?;
    let start = Instant::now();
    let matches = engine.store.evaluate(&t);
    let duration_us = start.elapsed().as_micros() as u64;
    engine
        .metrics
        .record_evaluation(matches.len() as u64, duration_us);
    Ok(matches.iter().map(match_to_js).collect())
}

#[napi(ts_args_type = "callback: (err: null, matches: string) => void")]
pub fn on_condition_match(callback: ThreadsafeFunction<String, ErrorStrategy::Fatal>) -> Result<()> {
    let engine = get_engine()?;
    let receiver = engine.match_receiver.clone();

    *engine.match_callback.write() = Some(callback.clone());

    std::thread::spawn(move || {
        while let Ok(batch) = receiver.recv() {
            if let Ok(json) = serde_json::to_string(&batch) {
                callback.call(json, ThreadsafeFunctionCallMode::NonBlocking);
            }
        }
    });

    Ok(())
}

#[napi]
pub fn get_engine_metrics() -> Result<EngineMetricsJs> {
    let engine = get_engine()?;

    let strategy_metrics: Vec<StrategyMetricsJs> = engine
        .store
        .registry()
        .strategy_metrics()
        .into_iter()
        .map(|(name, count)| StrategyMetricsJs {
            strategy_type: name,
            condition_count: count as f64,
        })
        .collect();

    Ok(EngineMetricsJs {
        total_conditions: engine.store.condition_count() as f64,
        total_ticks_processed: engine.metrics.total_ticks() as f64,
        total_matches: engine.metrics.total_matches() as f64,
        ticks_per_second: engine.metrics.ticks_per_second(),
        matches_per_second: engine.metrics.matches_per_second(),
        avg_evaluation_us: engine.metrics.avg_evaluation_us(),
        strategies: strategy_metrics,
    })
}
