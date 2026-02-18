use dashmap::DashMap;
use parking_lot::RwLock;
use shared_types::{AlertCondition, ConditionMatch, ConditionOperator, EvaluationStrategy, NormalizedTick};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Sentinel-based threshold crossing strategy for numeric alerts.
///
/// Instead of checking every condition on every tick, we maintain a sorted
/// B-tree of threshold levels per symbol. For each symbol we track the
/// current price and the two nearest thresholds (sentinels) — one above
/// and one below the current price.
///
/// On each tick:
/// 1. Compare new price against sentinels → O(1)
/// 2. If no crossing: skip (99%+ of ticks) → O(1) total
/// 3. If crossing: range scan the B-tree for all thresholds between
///    old price and new price → O(log n + k) where k = matches
/// 4. Recompute sentinels from next thresholds → O(log n)
///
/// This is the same principle used by exchange order matching engines.
pub struct ThresholdCrossingStrategy {
    /// symbol → ThresholdTree (sorted thresholds + sentinels)
    trees: DashMap<String, RwLock<ThresholdTree>>,
    /// condition_id → stored condition data needed for match emission
    conditions: DashMap<String, StoredCondition>,
    condition_count: AtomicU64,
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

/// Per-symbol sorted threshold tree with sentinel tracking.
struct ThresholdTree {
    /// threshold_value → Vec<condition_id> (multiple conditions can share a threshold)
    /// BTreeMap gives us O(log n) range queries and ordered iteration.
    thresholds: BTreeMap<OrderedF64, Vec<String>>,
    /// The last known price for this symbol
    last_price: Option<f64>,
    /// Nearest threshold ABOVE current price (upper sentinel)
    upper_sentinel: Option<f64>,
    /// Nearest threshold BELOW current price (lower sentinel)
    lower_sentinel: Option<f64>,
}

/// Wrapper for f64 that implements Ord for use in BTreeMap.
/// We use total_ordering: NaN < everything else, which is fine since
/// we never insert NaN thresholds.
#[derive(Debug, Clone, Copy, PartialEq)]
struct OrderedF64(f64);

impl Eq for OrderedF64 {}

impl PartialOrd for OrderedF64 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for OrderedF64 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&other.0)
    }
}

impl ThresholdTree {
    fn new() -> Self {
        Self {
            thresholds: BTreeMap::new(),
            last_price: None,
            upper_sentinel: None,
            lower_sentinel: None,
        }
    }

    fn add_threshold(&mut self, threshold: f64, condition_id: String) {
        let key = OrderedF64(threshold);
        self.thresholds.entry(key).or_default().push(condition_id);
        // Recompute sentinels if we have a current price
        if let Some(price) = self.last_price {
            self.recompute_sentinels(price);
        }
    }

    fn remove_threshold(&mut self, threshold: f64, condition_id: &str) {
        let key = OrderedF64(threshold);
        if let Some(ids) = self.thresholds.get_mut(&key) {
            ids.retain(|id| id != condition_id);
            if ids.is_empty() {
                self.thresholds.remove(&key);
            }
        }
        if let Some(price) = self.last_price {
            self.recompute_sentinels(price);
        }
    }

    /// Recompute the sentinel thresholds relative to the given price.
    fn recompute_sentinels(&mut self, price: f64) {
        let key = OrderedF64(price);

        // Upper sentinel: first threshold strictly above price
        self.upper_sentinel = self
            .thresholds
            .range((std::ops::Bound::Excluded(key), std::ops::Bound::Unbounded))
            .next()
            .map(|(k, _)| k.0);

        // Lower sentinel: last threshold strictly below price
        self.lower_sentinel = self
            .thresholds
            .range((std::ops::Bound::Unbounded, std::ops::Bound::Excluded(key)))
            .next_back()
            .map(|(k, _)| k.0);
    }

    /// Check if the price has crossed any sentinel and return crossed threshold condition IDs.
    ///
    /// Returns (crossed_condition_ids, new_price_was_set)
    fn evaluate(&mut self, new_price: f64) -> Vec<(String, f64)> {
        let old_price = match self.last_price {
            Some(p) => p,
            None => {
                // First tick for this symbol — set price, compute sentinels, no matches
                self.last_price = Some(new_price);
                self.recompute_sentinels(new_price);
                return Vec::new();
            }
        };

        // Fast path: check sentinels — O(1)
        let crossed_upper = self.upper_sentinel.is_some_and(|s| new_price >= s);
        let crossed_lower = self.lower_sentinel.is_some_and(|s| new_price <= s);

        if !crossed_upper && !crossed_lower {
            // No sentinel crossed — most ticks end here
            self.last_price = Some(new_price);
            return Vec::new();
        }

        // Slow path: range scan between old and new price
        let mut matched = Vec::new();

        if new_price > old_price {
            // Price went up — scan thresholds in (old_price, new_price]
            let range = self.thresholds.range(
                (std::ops::Bound::Excluded(OrderedF64(old_price)),
                 std::ops::Bound::Included(OrderedF64(new_price)))
            );
            for (threshold, condition_ids) in range {
                for id in condition_ids {
                    matched.push((id.clone(), threshold.0));
                }
            }
        } else {
            // Price went down — scan thresholds in [new_price, old_price)
            let range = self.thresholds.range(
                (std::ops::Bound::Included(OrderedF64(new_price)),
                 std::ops::Bound::Excluded(OrderedF64(old_price)))
            );
            for (threshold, condition_ids) in range {
                for id in condition_ids {
                    matched.push((id.clone(), threshold.0));
                }
            }
        }

        // Update price and recompute sentinels
        self.last_price = Some(new_price);
        self.recompute_sentinels(new_price);

        matched
    }
}

impl ThresholdCrossingStrategy {
    pub fn new() -> Self {
        Self {
            trees: DashMap::new(),
            conditions: DashMap::new(),
            condition_count: AtomicU64::new(0),
        }
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
            None => return, // Invalid condition — skip silently
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

        // Add to the per-symbol threshold tree
        self.trees
            .entry(condition.symbol.clone())
            .or_insert_with(|| RwLock::new(ThresholdTree::new()))
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
            None => return Vec::new(), // No conditions for this symbol
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

    #[test]
    fn test_no_match_within_sentinels() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
        strategy.add_condition(&make_condition("c2", "AAPL", 140.0, "cross_below"));

        // First tick sets the price — no match
        let tick1 = NormalizedTick::numeric("AAPL".into(), 145.0, 1000);
        assert!(strategy.evaluate(&tick1).is_empty());

        // Tick within sentinels (140, 150) — no match
        let tick2 = NormalizedTick::numeric("AAPL".into(), 146.0, 2000);
        assert!(strategy.evaluate(&tick2).is_empty());

        let tick3 = NormalizedTick::numeric("AAPL".into(), 144.0, 3000);
        assert!(strategy.evaluate(&tick3).is_empty());
    }

    #[test]
    fn test_cross_above_match() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));

        // Set initial price
        let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
        assert!(strategy.evaluate(&tick1).is_empty());

        // Cross above 150
        let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2000);
        let matches = strategy.evaluate(&tick2);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].condition_id, "c1");
    }

    #[test]
    fn test_cross_below_match() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 140.0, "cross_below"));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 141.0, 1000);
        assert!(strategy.evaluate(&tick1).is_empty());

        let tick2 = NormalizedTick::numeric("AAPL".into(), 139.0, 2000);
        let matches = strategy.evaluate(&tick2);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].condition_id, "c1");
    }

    #[test]
    fn test_multiple_thresholds_crossed() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
        strategy.add_condition(&make_condition("c2", "AAPL", 151.0, "cross_above"));
        strategy.add_condition(&make_condition("c3", "AAPL", 155.0, "cross_above"));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
        assert!(strategy.evaluate(&tick1).is_empty());

        // Big jump crosses both 150 and 151 but not 155
        let tick2 = NormalizedTick::numeric("AAPL".into(), 152.0, 2000);
        let matches = strategy.evaluate(&tick2);
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn test_cooldown_prevents_repeat() {
        let strategy = ThresholdCrossingStrategy::new();
        let mut cond = make_condition("c1", "AAPL", 150.0, "cross_above");
        cond.cooldown_ms = Some(60000); // 60 second cooldown
        strategy.add_condition(&cond);

        let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1_000_000);
        strategy.evaluate(&tick1);

        // First crossing — should match
        let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2_000_000);
        assert_eq!(strategy.evaluate(&tick2).len(), 1);

        // Drop below and cross again within cooldown — should NOT match
        let tick3 = NormalizedTick::numeric("AAPL".into(), 149.0, 3_000_000);
        strategy.evaluate(&tick3);
        let tick4 = NormalizedTick::numeric("AAPL".into(), 151.0, 4_000_000);
        assert_eq!(strategy.evaluate(&tick4).len(), 0);

        // Cross again after cooldown — should match
        let tick5 = NormalizedTick::numeric("AAPL".into(), 149.0, 62_000_001);
        strategy.evaluate(&tick5);
        let tick6 = NormalizedTick::numeric("AAPL".into(), 151.0, 63_000_000);
        assert_eq!(strategy.evaluate(&tick6).len(), 1);
    }

    #[test]
    fn test_remove_condition() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
        strategy.evaluate(&tick1);

        strategy.remove_condition("c1");
        assert_eq!(strategy.condition_count(), 0);

        let tick2 = NormalizedTick::numeric("AAPL".into(), 151.0, 2000);
        assert!(strategy.evaluate(&tick2).is_empty());
    }

    #[test]
    fn test_different_symbols_independent() {
        let strategy = ThresholdCrossingStrategy::new();
        strategy.add_condition(&make_condition("c1", "AAPL", 150.0, "cross_above"));
        strategy.add_condition(&make_condition("c2", "GOOG", 100.0, "cross_above"));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 149.0, 1000);
        let tick2 = NormalizedTick::numeric("GOOG".into(), 99.0, 1000);
        strategy.evaluate(&tick1);
        strategy.evaluate(&tick2);

        // Only AAPL crosses
        let tick3 = NormalizedTick::numeric("AAPL".into(), 151.0, 2000);
        let matches = strategy.evaluate(&tick3);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].condition_id, "c1");

        // GOOG didn't cross
        let tick4 = NormalizedTick::numeric("GOOG".into(), 99.5, 2000);
        assert!(strategy.evaluate(&tick4).is_empty());
    }
}
