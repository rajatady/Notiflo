use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Global engine metrics tracking.
pub struct MetricsTracker {
    start_time: Instant,
    total_ticks: AtomicU64,
    total_matches: AtomicU64,
    total_evaluation_us: AtomicU64,
}

impl MetricsTracker {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            total_ticks: AtomicU64::new(0),
            total_matches: AtomicU64::new(0),
            total_evaluation_us: AtomicU64::new(0),
        }
    }

    pub fn record_evaluation(&self, matches: u64, duration_us: u64) {
        self.total_ticks.fetch_add(1, Ordering::Relaxed);
        self.total_matches.fetch_add(matches, Ordering::Relaxed);
        self.total_evaluation_us.fetch_add(duration_us, Ordering::Relaxed);
    }

    pub fn ticks_per_second(&self) -> f64 {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        if elapsed > 0.0 {
            self.total_ticks.load(Ordering::Relaxed) as f64 / elapsed
        } else {
            0.0
        }
    }

    pub fn matches_per_second(&self) -> f64 {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        if elapsed > 0.0 {
            self.total_matches.load(Ordering::Relaxed) as f64 / elapsed
        } else {
            0.0
        }
    }

    pub fn avg_evaluation_us(&self) -> f64 {
        let ticks = self.total_ticks.load(Ordering::Relaxed);
        if ticks > 0 {
            self.total_evaluation_us.load(Ordering::Relaxed) as f64 / ticks as f64
        } else {
            0.0
        }
    }

    pub fn total_ticks(&self) -> u64 {
        self.total_ticks.load(Ordering::Relaxed)
    }

    pub fn total_matches(&self) -> u64 {
        self.total_matches.load(Ordering::Relaxed)
    }
}

impl Default for MetricsTracker {
    fn default() -> Self {
        Self::new()
    }
}
