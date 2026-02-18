import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 0.5,
      windowMs: 10000,
      resetTimeoutMs: 1000,
      halfOpenMaxAttempts: 2,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('starts CLOSED, allows requests', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should allow requests when CLOSED', async () => {
      const result = await breaker.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
    });

    it('should allow multiple successful requests', async () => {
      const r1 = await breaker.execute(() => Promise.resolve(1));
      const r2 = await breaker.execute(() => Promise.resolve(2));
      const r3 = await breaker.execute(() => Promise.resolve(3));

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('opens after failureThreshold exceeded', () => {
    it('should open when failure rate exceeds threshold', async () => {
      // With threshold at 0.5, all failures should trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should remain closed when failure rate stays below threshold', async () => {
      // Create a breaker with threshold 0.6
      const lenientBreaker = new CircuitBreaker('lenient', {
        failureThreshold: 0.6,
        windowMs: 10000,
        resetTimeoutMs: 1000,
      });

      // 1 success, 1 failure = 50% failure rate, below 60% threshold
      await lenientBreaker.execute(() => Promise.resolve('ok'));
      await expect(
        lenientBreaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(lenientBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('rejects calls when OPEN', () => {
    it('should throw CircuitOpenError when state is OPEN', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Subsequent calls should be rejected
      await expect(
        breaker.execute(() => Promise.resolve('should not run')),
      ).rejects.toThrow(CircuitOpenError);
    });

    it('should not execute the function when OPEN', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      const fn = jest.fn().mockResolvedValue('result');
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('transitions to HALF_OPEN after resetTimeout', () => {
    it('should transition from OPEN to HALF_OPEN after resetTimeoutMs', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past the resetTimeout (1000ms)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1100);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('closes on success in HALF_OPEN', () => {
    it('should close the circuit after enough successful attempts in HALF_OPEN', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time to trigger HALF_OPEN
      const originalNow = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(originalNow + 1100);

      // halfOpenMaxAttempts is 2, so 2 successes should close the circuit
      await breaker.execute(() => Promise.resolve('ok1'));
      await breaker.execute(() => Promise.resolve('ok2'));

      // Restore Date.now for state check
      (Date.now as jest.Mock).mockReturnValue(originalNow + 1200);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen the circuit on failure in HALF_OPEN', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time to trigger HALF_OPEN
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1100);

      // A failure in HALF_OPEN should reopen
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail again'))),
      ).rejects.toThrow('fail again');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('metrics', () => {
    it('should track total requests and success/failure counts', async () => {
      await breaker.execute(() => Promise.resolve('ok'));

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset the circuit breaker to initial state', async () => {
      // Trip the breaker
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
    });
  });
});
