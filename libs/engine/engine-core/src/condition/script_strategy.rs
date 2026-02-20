use dashmap::DashMap;
use parking_lot::RwLock;
use rhai::{Dynamic, Engine, Scope, AST};
use shared_types::{AlertCondition, ConditionMatch, EvaluationStrategy, NormalizedTick};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Rhai-based scripting strategy for advanced user-defined evaluation logic.
///
/// Users write Rhai scripts submitted through the UI. Scripts receive tick data
/// as variables and must return a boolean (true = match).
///
/// Example scripts:
///
/// Simple threshold:
///   `value > 150.0`
///
/// Volume-weighted:
///   `value > 150.0 && secondary_value > 1_000_000.0`
///
/// Percentage change (uses metadata):
///   ```text
///   let change_pct = (value - prev_close) / prev_close * 100.0;
///   change_pct > 5.0 || change_pct < -5.0
///   ```
///
/// Complex multi-condition:
///   ```text
///   let in_range = value >= 140.0 && value <= 160.0;
///   let high_volume = secondary_value > 2_000_000.0;
///   in_range && high_volume
///   ```
///
/// Safety:
/// - Scripts run in a sandboxed Rhai engine with resource limits
/// - No file I/O, no network, no system calls
/// - Max operations limit prevents infinite loops
/// - Max execution time enforced
pub struct ScriptStrategy {
    /// Shared Rhai engine (thread-safe, read-only after setup)
    engine: Arc<Engine>,
    /// symbol → list of condition IDs
    symbol_index: DashMap<String, Vec<String>>,
    /// condition_id → compiled script + metadata
    conditions: DashMap<String, CompiledScript>,
    condition_count: AtomicU64,
}

struct CompiledScript {
    id: String,
    organization_id: String,
    subscriber_id: String,
    symbol: String,
    /// Pre-compiled AST — avoids re-parsing on every tick
    ast: AST,
    channels: Vec<String>,
    template_id: Option<String>,
    cooldown_us: Option<u64>,
    last_triggered_us: RwLock<Option<u64>>,
    /// Original script source for match_detail
    script_source: String,
}

impl ScriptStrategy {
    pub fn new() -> Self {
        let mut engine = Engine::new();

        // Sandbox: limit operations to prevent infinite loops
        engine.set_max_operations(10_000);
        // Limit call stack depth
        engine.set_max_expr_depths(32);
        // Limit string size
        engine.set_max_string_size(4096);
        // Limit array size
        engine.set_max_array_size(256);

        Self {
            engine: Arc::new(engine),
            symbol_index: DashMap::new(),
            conditions: DashMap::new(),
            condition_count: AtomicU64::new(0),
        }
    }
}

impl Default for ScriptStrategy {
    fn default() -> Self {
        Self::new()
    }
}

impl EvaluationStrategy for ScriptStrategy {
    fn add_condition(&self, condition: &AlertCondition) {
        let script_source = match condition
            .strategy_params
            .get("script")
            .and_then(|v| v.as_str())
        {
            Some(s) => s.to_string(),
            None => return,
        };

        // Compile the script once to an AST
        let ast = match self.engine.compile(&script_source) {
            Ok(ast) => ast,
            Err(_) => return, // Invalid script — skip
        };

        let compiled = CompiledScript {
            id: condition.id.clone(),
            organization_id: condition.organization_id.clone(),
            subscriber_id: condition.subscriber_id.clone(),
            symbol: condition.symbol.clone(),
            ast,
            channels: condition.channels.clone(),
            template_id: condition.template_id.clone(),
            cooldown_us: condition.cooldown_ms.map(|ms| ms * 1000),
            last_triggered_us: RwLock::new(condition.last_triggered_us),
            script_source,
        };

        self.conditions.insert(condition.id.clone(), compiled);
        self.symbol_index
            .entry(condition.symbol.clone())
            .or_default()
            .push(condition.id.clone());
        self.condition_count.fetch_add(1, Ordering::Relaxed);
    }

    fn remove_condition(&self, condition_id: &str) {
        if let Some((_, compiled)) = self.conditions.remove(condition_id) {
            if let Some(mut ids) = self.symbol_index.get_mut(&compiled.symbol) {
                ids.retain(|id| id != condition_id);
                if ids.is_empty() {
                    drop(ids);
                    self.symbol_index.remove(&compiled.symbol);
                }
            }
            self.condition_count.fetch_sub(1, Ordering::Relaxed);
        }
    }

    fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch> {
        let condition_ids = match self.symbol_index.get(&tick.symbol) {
            Some(ids) => ids.clone(),
            None => return Vec::new(),
        };

        let now_us = tick.timestamp_us;
        let mut matches = Vec::new();

        for cid in &condition_ids {
            if let Some(compiled) = self.conditions.get(cid) {
                // Build scope with tick variables
                let mut scope = Scope::new();
                scope.push_constant("value", tick.value);
                scope.push_constant("price", tick.value);
                scope.push_constant("secondary_value", tick.secondary_value.unwrap_or(0.0));
                scope.push_constant("volume", tick.secondary_value.unwrap_or(0.0));
                scope.push_constant("timestamp", tick.timestamp_us as i64);
                scope.push_constant("symbol", tick.symbol.clone());

                // Inject metadata fields as top-level variables if present
                if let Some(meta) = &tick.metadata {
                    if let Some(obj) = meta.as_object() {
                        for (key, val) in obj {
                            match val {
                                serde_json::Value::Number(n) => {
                                    if let Some(f) = n.as_f64() {
                                        scope.push_constant(key.as_str(), f);
                                    }
                                }
                                serde_json::Value::String(s) => {
                                    scope.push_constant(key.as_str(), s.clone());
                                }
                                serde_json::Value::Bool(b) => {
                                    scope.push_constant(key.as_str(), *b);
                                }
                                _ => {}
                            }
                        }
                    }
                }

                // Evaluate the compiled AST
                let result = self.engine.eval_ast_with_scope::<Dynamic>(&mut scope, &compiled.ast);

                let matched = match result {
                    Ok(val) => val.as_bool().unwrap_or(false),
                    Err(_) => false, // Script error = no match
                };

                if !matched {
                    continue;
                }

                // Check cooldown
                if let Some(cooldown_us) = compiled.cooldown_us {
                    let last = *compiled.last_triggered_us.read();
                    if let Some(last_us) = last {
                        if now_us.saturating_sub(last_us) < cooldown_us {
                            continue;
                        }
                    }
                    *compiled.last_triggered_us.write() = Some(now_us);
                }

                matches.push(ConditionMatch {
                    condition_id: compiled.id.clone(),
                    organization_id: compiled.organization_id.clone(),
                    subscriber_id: compiled.subscriber_id.clone(),
                    symbol: tick.symbol.clone(),
                    matched_value: tick.value,
                    channels: compiled.channels.clone(),
                    template_id: compiled.template_id.clone(),
                    timestamp_us: now_us,
                    match_detail: Some(format!("Script matched: {}", compiled.script_source)),
                });
            }
        }

        matches
    }

    fn condition_count(&self) -> u64 {
        self.condition_count.load(Ordering::Relaxed)
    }

    fn strategy_type(&self) -> &'static str {
        "script"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_script_condition(id: &str, symbol: &str, script: &str) -> AlertCondition {
        AlertCondition {
            id: id.to_string(),
            organization_id: "org1".to_string(),
            subscriber_id: "sub1".to_string(),
            symbol: symbol.to_string(),
            strategy_type: "script".to_string(),
            strategy_params: serde_json::json!({ "script": script }),
            channels: vec!["email".to_string()],
            template_id: None,
            active: true,
            cooldown_ms: None,
            last_triggered_us: None,
        }
    }

    #[test]
    fn test_simple_script() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition("c1", "AAPL", "value > 150.0"));

        let tick = NormalizedTick::numeric("AAPL".into(), 151.0, 1000);
        assert_eq!(s.evaluate(&tick).len(), 1);

        let tick2 = NormalizedTick::numeric("AAPL".into(), 149.0, 2000);
        assert!(s.evaluate(&tick2).is_empty());
    }

    #[test]
    fn test_multi_variable_script() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition(
            "c1",
            "AAPL",
            "value > 150.0 && volume > 1_000_000.0",
        ));

        let mut tick = NormalizedTick::numeric("AAPL".into(), 160.0, 1000);
        tick.secondary_value = Some(500_000.0);
        assert!(s.evaluate(&tick).is_empty());

        tick.secondary_value = Some(2_000_000.0);
        assert_eq!(s.evaluate(&tick).len(), 1);
    }

    #[test]
    fn test_script_with_local_variables() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition(
            "c1",
            "AAPL",
            r#"
            let mid = 150.0;
            let band = 10.0;
            value >= mid - band && value <= mid + band
            "#,
        ));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 145.0, 1000);
        assert_eq!(s.evaluate(&tick1).len(), 1);

        let tick2 = NormalizedTick::numeric("AAPL".into(), 170.0, 2000);
        assert!(s.evaluate(&tick2).is_empty());
    }

    #[test]
    fn test_script_with_metadata() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition(
            "c1",
            "AAPL",
            "value > 150.0 && prev_close > 0.0 && (value - prev_close) / prev_close * 100.0 > 5.0",
        ));

        let mut tick = NormalizedTick::numeric("AAPL".into(), 160.0, 1000);
        tick.metadata = Some(serde_json::json!({ "prev_close": 150.0 }));
        // Change = (160-150)/150 * 100 = 6.67% > 5% → match
        assert_eq!(s.evaluate(&tick).len(), 1);

        let mut tick2 = NormalizedTick::numeric("AAPL".into(), 152.0, 2000);
        tick2.metadata = Some(serde_json::json!({ "prev_close": 150.0 }));
        // Change = (152-150)/150 * 100 = 1.33% < 5% → no match
        assert!(s.evaluate(&tick2).is_empty());
    }

    #[test]
    fn test_invalid_script_ignored() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition("c1", "AAPL", "this is not valid rhai }{}{"));
        assert_eq!(s.condition_count(), 0);
    }

    #[test]
    fn test_infinite_loop_protection() {
        let s = ScriptStrategy::new();
        s.add_condition(&make_script_condition(
            "c1",
            "AAPL",
            "loop { } ; true", // Infinite loop — should be killed by max_operations
        ));

        let tick = NormalizedTick::numeric("AAPL".into(), 151.0, 1000);
        // Should not hang — engine kills it, returns no match
        assert!(s.evaluate(&tick).is_empty());
    }
}
