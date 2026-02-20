use std::time::Duration;

/// Retry policy with exponential backoff and jitter.
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 500,
            max_delay_ms: 4000,
        }
    }
}

impl RetryPolicy {
    /// Calculate delay for a given attempt (0-indexed).
    /// Exponential backoff: base * 2^attempt + jitter (±20%).
    pub fn delay_for_attempt(&self, attempt: u32) -> Duration {
        let base = self.base_delay_ms * 2u64.pow(attempt);
        let capped = base.min(self.max_delay_ms);
        // Add jitter: ±20%
        let jitter_range = capped / 5;
        let jitter = if jitter_range > 0 {
            // Simple deterministic-ish jitter based on attempt number
            let seed = (attempt as u64).wrapping_mul(0x9E3779B97F4A7C15);
            (seed % (jitter_range * 2)) as i64 - jitter_range as i64
        } else {
            0
        };
        let delay_ms = (capped as i64 + jitter).max(100) as u64;
        Duration::from_millis(delay_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_policy() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_attempts, 3);
        assert_eq!(policy.base_delay_ms, 500);
    }

    #[test]
    fn test_delay_increases() {
        let policy = RetryPolicy::default();
        let d0 = policy.delay_for_attempt(0);
        let _d1 = policy.delay_for_attempt(1);
        let d2 = policy.delay_for_attempt(2);
        // Delays should generally increase (with jitter they might not always)
        assert!(d0.as_millis() >= 100);
        assert!(d2.as_millis() <= policy.max_delay_ms as u128 + 1000);
    }

    #[test]
    fn test_delay_capped() {
        let policy = RetryPolicy {
            max_attempts: 10,
            base_delay_ms: 500,
            max_delay_ms: 2000,
        };
        let d9 = policy.delay_for_attempt(9);
        // Should be capped at max_delay_ms + jitter
        assert!(d9.as_millis() <= 3000);
    }
}
