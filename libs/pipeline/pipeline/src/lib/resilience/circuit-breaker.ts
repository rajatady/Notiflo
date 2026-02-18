export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN. Requests are being rejected.`);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Failure rate threshold (0-1). Default 0.5 (50%) */
  failureThreshold?: number;
  /** Sliding window duration in ms. Default 10000 */
  windowMs?: number;
  /** Time to wait before transitioning from OPEN to HALF_OPEN in ms. Default 30000 */
  resetTimeoutMs?: number;
  /** Max attempts allowed in HALF_OPEN state. Default 10 */
  halfOpenMaxAttempts?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  lastFailureTime: number | null;
  halfOpenAttempts: number;
}

interface WindowEntry {
  timestamp: number;
  success: boolean;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  private window: WindowEntry[] = [];
  private lastFailureTime: number | null = null;
  private openedAt: number | null = null;
  private halfOpenSuccessCount = 0;
  private halfOpenAttemptCount = 0;
  private totalRequests = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 0.5;
    this.windowMs = options.windowMs ?? 10000;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 10;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitOpenError(this.name);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenAttemptCount >= this.halfOpenMaxAttempts) {
        // All half-open attempts used; if we got here they all succeeded
        this.transitionTo(CircuitState.CLOSED);
        return this.execute(fn);
      }
      this.halfOpenAttemptCount++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    this.pruneWindow();
    const windowSuccesses = this.window.filter((e) => e.success).length;
    const windowFailures = this.window.filter((e) => !e.success).length;
    const windowTotal = this.window.length;

    return {
      state: this.state,
      totalRequests: this.totalRequests,
      successCount: this.totalSuccesses,
      failureCount: this.totalFailures,
      failureRate: windowTotal > 0 ? windowFailures / windowTotal : 0,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttemptCount,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.window = [];
    this.lastFailureTime = null;
    this.openedAt = null;
    this.halfOpenSuccessCount = 0;
    this.halfOpenAttemptCount = 0;
    this.totalRequests = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
  }

  private evaluateState(): void {
    if (this.state === CircuitState.OPEN && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenSuccessCount = 0;
      this.halfOpenAttemptCount = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.window = [];
      this.openedAt = null;
      this.halfOpenSuccessCount = 0;
      this.halfOpenAttemptCount = 0;
    } else if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
    }
  }

  private recordSuccess(): void {
    this.totalRequests++;
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.halfOpenMaxAttempts) {
        this.transitionTo(CircuitState.CLOSED);
      }
      return;
    }

    this.window.push({ timestamp: Date.now(), success: true });
    this.pruneWindow();
  }

  private recordFailure(): void {
    this.totalRequests++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    this.window.push({ timestamp: Date.now(), success: false });
    this.pruneWindow();
    this.checkThreshold();
  }

  private pruneWindow(): void {
    const cutoff = Date.now() - this.windowMs;
    this.window = this.window.filter((e) => e.timestamp >= cutoff);
  }

  private checkThreshold(): void {
    if (this.window.length === 0) return;

    const failures = this.window.filter((e) => !e.success).length;
    const failureRate = failures / this.window.length;

    if (failureRate >= this.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }
}
