export interface RateLimiterOptions {
  /** Maximum number of tokens in the bucket */
  maxTokens: number;
  /** Number of tokens added per refill interval */
  refillRate: number;
  /** Refill interval in ms. Default 1000 (1 second) */
  refillIntervalMs?: number;
}

export interface RateLimiterMetrics {
  availableTokens: number;
  maxTokens: number;
  refillRate: number;
  queuedRequests: number;
  totalAcquired: number;
  totalRejected: number;
}

interface QueuedRequest {
  count: number;
  resolve: () => void;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;
  private refillTimer: ReturnType<typeof setInterval> | null = null;
  private queue: QueuedRequest[] = [];
  private totalAcquired = 0;
  private totalRejected = 0;

  constructor(
    private readonly name: string,
    options: RateLimiterOptions,
  ) {
    this.maxTokens = options.maxTokens;
    this.tokens = options.maxTokens;
    this.refillRate = options.refillRate;
    this.refillIntervalMs = options.refillIntervalMs ?? 1000;
  }

  /**
   * Acquire tokens, waiting if necessary until tokens are available.
   * Queued requests are served FIFO.
   */
  acquire(count = 1): Promise<void> {
    if (this.tokens >= count) {
      this.tokens -= count;
      this.totalAcquired += count;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ count, resolve });
    });
  }

  /**
   * Try to acquire tokens immediately without waiting.
   * Returns true if tokens were available, false otherwise.
   */
  tryAcquire(count = 1): boolean {
    if (this.tokens >= count) {
      this.tokens -= count;
      this.totalAcquired += count;
      return true;
    }
    this.totalRejected += count;
    return false;
  }

  getAvailableTokens(): number {
    return this.tokens;
  }

  getMetrics(): RateLimiterMetrics {
    return {
      availableTokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      queuedRequests: this.queue.length,
      totalAcquired: this.totalAcquired,
      totalRejected: this.totalRejected,
    };
  }

  start(): void {
    if (this.refillTimer !== null) return;

    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.refillIntervalMs);
  }

  stop(): void {
    if (this.refillTimer !== null) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  private refill(): void {
    this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (this.tokens >= next.count) {
        this.tokens -= next.count;
        this.totalAcquired += next.count;
        this.queue.shift();
        next.resolve();
      } else {
        break;
      }
    }
  }
}
