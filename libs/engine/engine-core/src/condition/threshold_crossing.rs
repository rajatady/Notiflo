use dashmap::DashMap;
use parking_lot::RwLock;
use shared_types::{AlertCondition, ConditionMatch, ConditionOperator, EvaluationStrategy, NormalizedTick};
use std::sync::atomic::{AtomicU64, Ordering};

/// Algorithm selection for threshold evaluation.
///
/// - `DriftSentinel`: Index-carry sentinel — O(1) amortized sentinel updates.
///    After a crossing, the new sentinel position is found by walking the sorted
///    array from the current index. No binary search needed post-crossing.
///    Based on: "A stochastic cost model for streaming threshold evaluation
///    under local continuity."
///
/// - `BinarySearch`: Sorted Vec with `partition_point` on every tick.
///    Always O(log n) per tick regardless of crossing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThresholdAlgorithm {
    DriftSentinel,
    BinarySearch,
}

impl Default for ThresholdAlgorithm {
    fn default() -> Self {
        Self::DriftSentinel
    }
}

/// Sentinel-based threshold crossing strategy for numeric alerts.
///
/// Maintains a sorted array of threshold levels per symbol. The evaluation
/// algorithm is selectable between DriftSentinel (index-carry, default) and
/// BinarySearch.
///
/// **DriftSentinel** (default):
/// 1. Compare new price against sentinel values → O(1)
/// 2. If no crossing: skip (99%+ of ticks) → O(1) total
/// 3. If crossing: walk the sorted array from the sentinel index, collecting
///    all matched thresholds. The new sentinel is the index where walking stopped.
///    → O(k) where k = crossings (amortized O(1) for sentinel recomputation)
///
/// **BinarySearch**:
/// 1. Use `partition_point` to find thresholds in the crossed range → O(log n)
/// 2. Scan the range for matches → O(k)
pub struct ThresholdCrossingStrategy {
    /// symbol → ThresholdTree (sorted thresholds + sentinels)
    trees: DashMap<String, RwLock<ThresholdTree>>,
    /// condition_id → stored condition data needed for match emission
    conditions: DashMap<String, StoredCondition>,
    condition_count: AtomicU64,
    algorithm: ThresholdAlgorithm,
}

/// Per-condition data stored for match emission.
struct StoredCondition {
    id: String,
    organization_id: String,
    subscriber_id: String,
    symbol: String,
    threshold: f64,
    operator: ConditionOperator,
    channels: Vec<String>,
    template_id: Option<String>,
    cooldown_us: Option<u64>,
    last_triggered_us: RwLock<Option<u64>>,
}

/// A single threshold level in the sorted array. Multiple conditions can
/// share the same threshold value.
struct ThresholdEntry {
    value: f64,
    condition_ids: Vec<String>,
}

/// Per-symbol sorted threshold array with sentinel tracking.
struct ThresholdTree {
    /// Sorted by threshold value (ascending). Each entry can hold multiple condition IDs.
    entries: Vec<ThresholdEntry>,
    /// The last known price for this symbol
    last_price: Option<f64>,
    /// Index of the upper sentinel in `entries` (first threshold > price)
    upper_idx: Option<usize>,
    /// Index of the lower sentinel in `entries` (last threshold < price)
    lower_idx: Option<usize>,
    /// Which algorithm to use for evaluation
    algorithm: ThresholdAlgorithm,
}

impl ThresholdTree {
    fn new(algorithm: ThresholdAlgorithm) -> Self {
        Self {
            entries: Vec::new(),
            last_price: None,
            upper_idx: None,
            lower_idx: None,
            algorithm,
        }
    }

    /// Insert a threshold into the sorted array, maintaining sort order.
    fn add_threshold(&mut self, threshold: f64, condition_id: String) {
        // Find existing entry with this threshold value
        let pos = self.entries.partition_point(|e| e.value < threshold);
        if pos < self.entries.len() && (self.entries[pos].value - threshold).abs() < f64::EPSILON {
            // Existing threshold level — append condition ID
            self.entries[pos].condition_ids.push(condition_id);
        } else {
            // New threshold level — insert at sorted position
            self.entries.insert(pos, ThresholdEntry {
                value: threshold,
                condition_ids: vec![condition_id],
            });
        }
        // Recompute sentinels if we have a current price
        if let Some(price) = self.last_price {
            self.recompute_sentinels(price);
        }
    }

    /// Remove a condition from a threshold level. If the level becomes empty, remove it.
    fn remove_threshold(&mut self, threshold: f64, condition_id: &str) {
        let pos = self.entries.partition_point(|e| e.value < threshold);
        if pos < self.entries.len() && (self.entries[pos].value - threshold).abs() < f64::EPSILON {
            self.entries[pos].condition_ids.retain(|id| id != condition_id);
            if self.entries[pos].condition_ids.is_empty() {
                self.entries.remove(pos);
            }
        }
        if let Some(price) = self.last_price {
            self.recompute_sentinels(price);
        }
    }

    /// Recompute sentinel indices relative to the given price using binary search.
    fn recompute_sentinels(&mut self, price: f64) {
        if self.entries.is_empty() {
            self.upper_idx = None;
            self.lower_idx = None;
            return;
        }

        // partition_point returns index of first element >= price
        let split = self.entries.partition_point(|e| e.value < price);

        // Skip entries exactly at price for upper sentinel
        let mut upper = split;
        while upper < self.entries.len()
            && (self.entries[upper].value - price).abs() < f64::EPSILON
        {
            upper += 1;
        }
        self.upper_idx = if upper < self.entries.len() {
            Some(upper)
        } else {
            None
        };

        // Lower sentinel: last entry strictly below price
        self.lower_idx = if split > 0 {
            // Check that entries[split-1] is strictly below price
            if self.entries[split - 1].value < price - f64::EPSILON {
                Some(split - 1)
            } else if split >= 2 {
                // entries[split-1] is at price, go one more back
                Some(split - 2)
            } else {
                None
            }
        } else {
            None
        };
    }

    /// Evaluate a tick using the selected algorithm.
    fn evaluate(&mut self, new_price: f64) -> Vec<(String, f64)> {
        match self.algorithm {
            ThresholdAlgorithm::DriftSentinel => self.evaluate_drift_sentinel(new_price),
            ThresholdAlgorithm::BinarySearch => self.evaluate_binary_search(new_price),
        }
    }

    /// Drift Sentinel evaluation: O(1) sentinel check, O(k) index-carry on crossing.
    ///
    /// After a crossing, we walk forward/backward from the current sentinel index
    /// to find all crossed thresholds. The new sentinel is simply the index where
    /// the walk stopped — no binary search needed.
    fn evaluate_drift_sentinel(&mut self, new_price: f64) -> Vec<(String, f64)> {
        let old_price = match self.last_price {
            Some(p) => p,
            None => {
                self.last_price = Some(new_price);
                self.recompute_sentinels(new_price);
                return Vec::new();
            }
        };

        // Fast path: O(1) sentinel check
        let crossed_upper = self.upper_idx
            .is_some_and(|idx| new_price >= self.entries[idx].value);
        let crossed_lower = self.lower_idx
            .is_some_and(|idx| new_price <= self.entries[idx].value);

        if !crossed_upper && !crossed_lower {
            self.last_price = Some(new_price);
            return Vec::new();
        }

        let mut matched = Vec::new();

        if new_price > old_price {
            // Price went up — walk forward from upper sentinel index
            if let Some(start_idx) = self.upper_idx {
                let mut idx = start_idx;
                while idx < self.entries.len() && self.entries[idx].value <= new_price {
                    for cid in &self.entries[idx].condition_ids {
                        matched.push((cid.clone(), self.entries[idx].value));
                    }
                    idx += 1;
                }
                // New upper sentinel = where we stopped walking
                self.upper_idx = if idx < self.entries.len() {
                    Some(idx)
                } else {
                    None
                };
                // New lower sentinel = one step back from where we stopped
                // (the last threshold we crossed, or the one just below new_price)
                self.lower_idx = if idx > 0 {
                    Some(idx - 1)
                } else {
                    None
                };
            }
        } else {
            // Price went down — walk backward from lower sentinel index
            if let Some(start_idx) = self.lower_idx {
                let mut idx = start_idx;
                loop {
                    if self.entries[idx].value >= new_price {
                        for cid in &self.entries[idx].condition_ids {
                            matched.push((cid.clone(), self.entries[idx].value));
                        }
                        if idx == 0 {
                            // Walked past the beginning
                            self.lower_idx = None;
                            self.upper_idx = Some(0);
                            break;
                        }
                        idx -= 1;
                    } else {
                        // Stopped walking — this entry is below new_price
                        self.lower_idx = Some(idx);
                        self.upper_idx = Some(idx + 1);
                        break;
                    }
                }
                // Edge case: walked all the way down and the loop ended normally
                // (handled by idx == 0 check above)
            }
        }

        self.last_price = Some(new_price);
        matched
    }

    /// Binary Search evaluation: O(log n) per tick via partition_point.
    fn evaluate_binary_search(&mut self, new_price: f64) -> Vec<(String, f64)> {
        let old_price = match self.last_price {
            Some(p) => p,
            None => {
                self.last_price = Some(new_price);
                return Vec::new();
            }
        };

        self.last_price = Some(new_price);

        if (new_price - old_price).abs() < f64::EPSILON {
            return Vec::new();
        }

        let mut matched = Vec::new();

        if new_price > old_price {
            // Price went up — find thresholds in (old_price, new_price]
            let start = self.entries.partition_point(|e| e.value <= old_price);
            let end = self.entries.partition_point(|e| e.value <= new_price);
            for entry in &self.entries[start..end] {
                for cid in &entry.condition_ids {
                    matched.push((cid.clone(), entry.value));
                }
            }
        } else {
            // Price went down — find thresholds in [new_price, old_price)
            let start = self.entries.partition_point(|e| e.value < new_price);
            let end = self.entries.partition_point(|e| e.value < old_price);
            for entry in &self.entries[start..end] {
                for cid in &entry.condition_ids {
                    matched.push((cid.clone(), entry.value));
                }
            }
        }

        matched
    }
}

impl ThresholdCrossingStrategy {
    pub fn new() -> Self {
        Self::with_algorithm(ThresholdAlgorithm::default())
    }

    pub fn with_algorithm(algorithm: ThresholdAlgorithm) -> Self {
        Self {
            trees: DashMap::new(),
            conditions: DashMap::new(),
            condition_count: AtomicU64::new(0),
            algorithm,
        }
    }

    pub fn algorithm(&self) -> ThresholdAlgorithm {
        self.algorithm
    }

    fn parse_threshold(params: &serde_json::Value) -> Option<f64> {
        params.get("threshold").and_then(|v| v.as_f64())
    }

    fn parse_operator(params: &serde_json::Value) -> ConditionOperator {
        params
            .get("operator")
            .and_then(|v| v.as_str())
            .and_then(|s| serde_json::from_value(serde_json::Value::String(s.to_string())).ok())
            .unwrap_or(ConditionOperator::CrossAbove)
    }
}

impl Default for ThresholdCrossingStrategy {
    fn default() -> Self {
        Self::new()
    }
}

impl EvaluationStrategy for ThresholdCrossingStrategy {
    fn add_condition(&self, condition: &AlertCondition) {
        let threshold = match Self::parse_threshold(&condition.strategy_params) {
            Some(t) => t,
            None => return,
        };
        let operator = Self::parse_operator(&condition.strategy_params);

        let stored = StoredCondition {
            id: condition.id.clone(),
            organization_id: condition.organization_id.clone(),
            subscriber_id: condition.subscriber_id.clone(),
            symbol: condition.symbol.clone(),
            threshold,
            operator,
            channels: condition.channels.clone(),
            template_id: condition.template_id.clone(),
            cooldown_us: condition.cooldown_ms.map(|ms| ms * 1000),
            last_triggered_us: RwLock::new(condition.last_triggered_us),
        };

        self.conditions.insert(condition.id.clone(), stored);

        let algo = self.algorithm;
        self.trees
            .entry(condition.symbol.clone())
            .or_insert_with(|| RwLock::new(ThresholdTree::new(algo)))
            .write()
            .add_threshold(threshold, condition.id.clone());

        self.condition_count.fetch_add(1, Ordering::Relaxed);
    }

    fn remove_condition(&self, condition_id: &str) {
        if let Some((_, stored)) = self.conditions.remove(condition_id) {
            if let Some(tree_lock) = self.trees.get(&stored.symbol) {
                tree_lock.write().remove_threshold(stored.threshold, condition_id);
            }
            self.condition_count.fetch_sub(1, Ordering::Relaxed);
        }
    }

    fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch> {
        let tree_lock = match self.trees.get(&tick.symbol) {
            Some(t) => t,
            None => return Vec::new(),
        };

        let crossed = tree_lock.write().evaluate(tick.value);

        if crossed.is_empty() {
            return Vec::new();
        }

        let mut matches = Vec::with_capacity(crossed.len());
        let now_us = tick.timestamp_us;

        for (condition_id, threshold) in crossed {
            if let Some(stored) = self.conditions.get(&condition_id) {
                // Check operator direction
                let direction_ok = match stored.operator {
                    ConditionOperator::CrossAbove | ConditionOperator::GreaterThan | ConditionOperator::GreaterThanOrEqual => {
                        tick.value >= threshold
                    }
                    ConditionOperator::CrossBelow | ConditionOperator::LessThan | ConditionOperator::LessThanOrEqual => {
                        tick.value <= threshold
                    }
                    ConditionOperator::Equal => (tick.value - threshold).abs() < f64::EPSILON,
                    ConditionOperator::NotEqual => (tick.value - threshold).abs() >= f64::EPSILON,
                };

                if !direction_ok {
                    continue;
                }

                // Check cooldown
                if let Some(cooldown_us) = stored.cooldown_us {
                    let last = *stored.last_triggered_us.read();
                    if let Some(last_us) = last {
                        if now_us.saturating_sub(last_us) < cooldown_us {
                            continue;
                        }
                    }
                    *stored.last_triggered_us.write() = Some(now_us);
                }

                let detail = format!(
                    "Price {} threshold {} (was crossing at {})",
                    if tick.value >= threshold { "crossed above" } else { "crossed below" },
                    threshold,
                    tick.value
                );

                matches.push(ConditionMatch {
                    condition_id: stored.id.clone(),
                    organization_id: stored.organization_id.clone(),
                    subscriber_id: stored.subscriber_id.clone(),
                    symbol: tick.symbol.clone(),
                    matched_value: tick.value,
                    channels: stored.channels.clone(),
                    template_id: stored.template_id.clone(),
                    timestamp_us: now_us,
                    match_detail: Some(detail),
                });
            }
        }

        matches
    }

    fn condition_count(&self) -> u64 {
        self.condition_count.load(Ordering::Relaxed)
    }

    fn strategy_type(&self) -> &'static str {
        "threshold_crossing"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_condition(id: &str, symbol: &str, threshold: f64, operator: &str) -> AlertCondition {
        AlertCondition {
            id: id.to_string(),
            organization_id: "org1".to_string(),
            subscriber_id: "sub1".to_string(),
            symbol: symbol.to_string(),
            strategy_type: "threshold_crossing".to_string(),
            strategy_params: serde_json::json!({
                "threshold": threshold,
                "operator": operator,
            }),
            channels: vec!["email".to_string()],
            template_id: None,
            active: true,
            cooldown_ms: None,
            last_triggered_us: None,
        }
    }

    /// Run all core tests against both algorithms to ensure behavioral parity.
    fn strategies() -> Vec<(&'static str, ThresholdCrossingStrategy)> {
        vec![
            ("drift_sentinel", ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::DriftSentinel)),
            ("binary_search", ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::BinarySearch)),
        ]
    }

    #[test]
    fn test_no_match_within_sentinels() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
            strategy.add_condition(&make_condition("c2", "AAPL", 140.0, "cross_below"));

            let tick1 = NormalizedTick::numeric("AAPL".into(), 145.0, 1000);
            assert!(strategy.evaluate(&tick1).is_empty(), "{name}: first tick");

            let tick2 = NormalizedTick::numeric("AAPL".into(), 146.0, 2000);
            assert!(strategy.evaluate(&tick2).is_empty(), "{name}: within sentinels up");

            let tick3 = NormalizedTick::numeric("AAPL".into(), 144.0, 3000);
            assert!(strategy.evaluate(&tick3).is_empty(), "{name}: within sentinels down");
        }
    }

    #[test]
    fn test_cross_above_match() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));

            let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
            assert!(strategy.evaluate(&tick1).is_empty(), "{name}: init");

            let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2000);
            let matches = strategy.evaluate(&tick2);
            assert_eq!(matches.len(), 1, "{name}: cross above");
            assert_eq!(matches[0].condition_id, "c1", "{name}: correct id");
        }
    }

    #[test]
    fn test_cross_below_match() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 140.0, "cross_below"));

            let tick1 = NormalizedTick::numeric("AAPL".into(), 141.0, 1000);
            assert!(strategy.evaluate(&tick1).is_empty(), "{name}: init");

            let tick2 = NormalizedTick::numeric("AAPL".into(), 139.0, 2000);
            let matches = strategy.evaluate(&tick2);
            assert_eq!(matches.len(), 1, "{name}: cross below");
            assert_eq!(matches[0].condition_id, "c1", "{name}: correct id");
        }
    }

    #[test]
    fn test_multiple_thresholds_crossed() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
            strategy.add_condition(&make_condition("c2", "AAPL", 151.0, "cross_above"));
            strategy.add_condition(&make_condition("c3", "AAPL", 155.0, "cross_above"));

            let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
            assert!(strategy.evaluate(&tick1).is_empty(), "{name}: init");

            let tick2 = NormalizedTick::numeric("AAPL".into(), 152.0, 2000);
            let matches = strategy.evaluate(&tick2);
            assert_eq!(matches.len(), 2, "{name}: crossed 150 and 151 but not 155");
        }
    }

    #[test]
    fn test_cooldown_prevents_repeat() {
        for (name, strategy) in strategies() {
            let mut cond = make_condition("c1", "AAPL", 150.0, "cross_above");
            cond.cooldown_ms = Some(60000);
            strategy.add_condition(&cond);

            let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1_000_000);
            strategy.evaluate(&tick1);

            let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2_000_000);
            assert_eq!(strategy.evaluate(&tick2).len(), 1, "{name}: first cross");

            let tick3 = NormalizedTick::numeric("AAPL".into(), 149.0, 3_000_000);
            strategy.evaluate(&tick3);
            let tick4 = NormalizedTick::numeric("AAPL".into(), 151.0, 4_000_000);
            assert_eq!(strategy.evaluate(&tick4).len(), 0, "{name}: within cooldown");

            let tick5 = NormalizedTick::numeric("AAPL".into(), 149.0, 62_000_001);
            strategy.evaluate(&tick5);
            let tick6 = NormalizedTick::numeric("AAPL".into(), 151.0, 63_000_000);
            assert_eq!(strategy.evaluate(&tick6).len(), 1, "{name}: after cooldown");
        }
    }

    #[test]
    fn test_remove_condition() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));

            let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
            strategy.evaluate(&tick1);

            strategy.remove_condition("c1");
            assert_eq!(strategy.condition_count(), 0, "{name}: count");

            let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2000);
            assert!(strategy.evaluate(&tick2).is_empty(), "{name}: no match after remove");
        }
    }

    #[test]
    fn test_different_symbols_independent() {
        for (name, strategy) in strategies() {
            strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
            strategy.add_condition(&make_condition("c2", "GOOG", 100.0, "cross_above"));

            strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 149.0, 1000));
            strategy.evaluate(&NormalizedTick::numeric("GOOG".into(), 99.0, 1000));

            let matches = strategy.evaluate(&NormalizedTick::numeric("AAPL".into(), 151.0, 2000));
            assert_eq!(matches.len(), 1, "{name}: AAPL crosses");
            assert_eq!(matches[0].condition_id, "c1", "{name}: correct id");

            assert!(
                strategy.evaluate(&NormalizedTick::numeric("GOOG".into(), 99.5, 2000)).is_empty(),
                "{name}: GOOG no cross"
            );
        }
    }

    #[test]
    fn test_oscillating_price_drift_sentinel() {
        // Specifically tests that drift sentinel correctly carries indices
        // through multiple up/down crossings
        let strategy = ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::DriftSentinel);
        for i in 0..10 {
            let threshold = 100.0 + i as f64 * 10.0;
            strategy.add_condition(&make_condition(
                &format!("c{i}"),
                "SYM",
                threshold,
                "cross_above",
            ));
        }

        // Init at 95 (below all thresholds)
        strategy.evaluate(&NormalizedTick::numeric("SYM".into(), 95.0, 0));

        // Jump to 125 — should cross 100 and 110 and 120
        let m1 = strategy.evaluate(&NormalizedTick::numeric("SYM".into(), 125.0, 1));
        assert_eq!(m1.len(), 3, "cross 100, 110, 120");

        // Drop to 105 — should cross 110 and 120 going down (but operator is cross_above, so no match)
        let m2 = strategy.evaluate(&NormalizedTick::numeric("SYM".into(), 105.0, 2));
        assert_eq!(m2.len(), 0, "cross_above doesn't match going down");

        // Back up to 135 — should cross 110, 120, 130
        let m3 = strategy.evaluate(&NormalizedTick::numeric("SYM".into(), 135.0, 3));
        assert_eq!(m3.len(), 3, "cross 110, 120, 130 going back up");
    }

    #[test]
    fn test_algorithm_selection() {
        let ds = ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::DriftSentinel);
        assert_eq!(ds.algorithm(), ThresholdAlgorithm::DriftSentinel);

        let bs = ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::BinarySearch);
        assert_eq!(bs.algorithm(), ThresholdAlgorithm::BinarySearch);

        // Default is DriftSentinel
        let def = ThresholdCrossingStrategy::new();
        assert_eq!(def.algorithm(), ThresholdAlgorithm::DriftSentinel);
    }
}
