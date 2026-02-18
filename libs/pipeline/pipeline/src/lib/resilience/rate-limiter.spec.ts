import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.stop();
  });

  describe('allows requests within limit', () => {
    it('should allow acquiring tokens when tokens are available', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 5,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(2);
    });

    it('should allow acquiring multiple tokens at once', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should start with maxTokens available', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      expect(limiter.getAvailableTokens()).toBe(100);
    });
  });

  describe('rejects when limit exceeded', () => {
    it('should reject tryAcquire when no tokens available', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 2,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should reject tryAcquire when not enough tokens for requested count', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 3,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      expect(limiter.tryAcquire(4)).toBe(false);
    });

    it('should track rejected token counts in metrics', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 1,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      limiter.tryAcquire(); // success
      limiter.tryAcquire(); // rejected
      limiter.tryAcquire(); // rejected

      const metrics = limiter.getMetrics();
      expect(metrics.totalAcquired).toBe(1);
      expect(metrics.totalRejected).toBe(2);
    });
  });

  describe('refills tokens over time', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should refill tokens after the refill interval', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 5,
        refillRate: 2,
        refillIntervalMs: 100,
      });

      // Drain all tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getAvailableTokens()).toBe(0);

      limiter.start();

      // Advance time by one refill interval
      jest.advanceTimersByTime(100);

      expect(limiter.getAvailableTokens()).toBe(2);
    });

    it('should not exceed maxTokens after refill', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 5,
        refillRate: 10,
        refillIntervalMs: 100,
      });

      limiter.start();

      // Advance time by several intervals
      jest.advanceTimersByTime(500);

      // Should be capped at maxTokens
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should serve queued requests when tokens become available', async () => {
      limiter = new RateLimiter('test', {
        maxTokens: 1,
        refillRate: 1,
        refillIntervalMs: 100,
      });

      // Use the only token
      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(0);

      // Queue an acquire request
      let resolved = false;
      limiter.acquire().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      limiter.start();

      // Advance time to trigger refill
      jest.advanceTimersByTime(100);

      // Allow the promise microtask to resolve
      await Promise.resolve();

      expect(resolved).toBe(true);
    });
  });

  describe('metrics', () => {
    it('should report correct metrics', () => {
      limiter = new RateLimiter('test', {
        maxTokens: 10,
        refillRate: 2,
        refillIntervalMs: 1000,
      });

      limiter.tryAcquire(3);

      const metrics = limiter.getMetrics();
      expect(metrics.availableTokens).toBe(7);
      expect(metrics.maxTokens).toBe(10);
      expect(metrics.refillRate).toBe(2);
      expect(metrics.totalAcquired).toBe(3);
      expect(metrics.totalRejected).toBe(0);
      expect(metrics.queuedRequests).toBe(0);
    });
  });
});
