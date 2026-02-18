import { RetryHandler } from './retry';

describe('RetryHandler', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('retries on failure up to max retries', () => {
    it('should retry the specified number of times before throwing', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffMultiplier: 1,
      });

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(handler.execute(fn)).rejects.toThrow('fail');

      // 1 initial attempt + 3 retries = 4 total calls
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should succeed if a retry succeeds within maxRetries', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffMultiplier: 1,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await handler.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw the last error after exhausting all retries', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffMultiplier: 1,
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockRejectedValueOnce(new Error('error 3'));

      await expect(handler.execute(fn)).rejects.toThrow('error 3');
    });
  });

  describe('succeeds on first attempt without retry', () => {
    it('should not retry when the first attempt succeeds', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1,
        maxDelayMs: 10,
      });

      const fn = jest.fn().mockResolvedValue('ok');

      const result = await handler.execute(fn);

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return the result from the first successful call', async () => {
      const handler = new RetryHandler({ maxRetries: 5 });

      const result = await handler.execute(() =>
        Promise.resolve({ data: 42 }),
      );

      expect(result).toEqual({ data: 42 });
    });
  });

  describe('uses exponential backoff', () => {
    it('should increase delay with each retry using backoff multiplier', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      });

      // Spy on the private sleep method to capture delays
      const sleepSpy = jest
        .spyOn(handler as any, 'sleep')
        .mockResolvedValue(undefined);

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(handler.execute(fn)).rejects.toThrow('fail');

      // Should have slept 3 times (one per retry)
      expect(sleepSpy).toHaveBeenCalledTimes(3);

      // Verify that delays are increasing (exponential backoff with jitter)
      const delays = sleepSpy.mock.calls.map((call) => call[0] as number);

      // With backoff multiplier 2, base delays are: 100, 200, 400
      // With jitter, actual values will vary, but each should be >= half the base delay
      expect(delays[0]).toBeGreaterThanOrEqual(50); // base 100
      expect(delays[1]).toBeGreaterThanOrEqual(100); // base 200
      expect(delays[2]).toBeGreaterThanOrEqual(200); // base 400
    });

    it('should respect maxDelayMs cap', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 500,
        backoffMultiplier: 10,
      });

      const sleepSpy = jest
        .spyOn(handler as any, 'sleep')
        .mockResolvedValue(undefined);

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(handler.execute(fn)).rejects.toThrow('fail');

      // The base delay is capped at maxDelayMs (500), but jitter adds up to 100% of capped.
      // Formula: floor(capped + jitter) / 2 + capped / 2, so max is ~750.
      // All delays should be the same since they all hit the cap.
      const delays = sleepSpy.mock.calls.map((call) => call[0] as number);
      for (const delay of delays) {
        // Minimum: capped/2 + capped/2 = capped = 500 (when jitter=0)
        // Maximum: (capped + capped)/2 + capped/2 = capped + capped/2 = 750 (when jitter=capped)
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(750);
      }
    });
  });

  describe('retryable errors', () => {
    it('should not retry non-retryable errors when retryableErrors is specified', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1,
        retryableErrors: ['TimeoutError'],
      });

      const fn = jest.fn().mockRejectedValue(new Error('AuthError'));

      await expect(handler.execute(fn)).rejects.toThrow('AuthError');

      // Should only be called once -- no retries for non-retryable error
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry retryable errors when retryableErrors is specified', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialDelayMs: 1,
        maxDelayMs: 10,
        backoffMultiplier: 1,
        retryableErrors: ['TimeoutError'],
      });

      const fn = jest.fn().mockRejectedValue(new Error('TimeoutError'));

      await expect(handler.execute(fn)).rejects.toThrow('TimeoutError');

      // 1 initial + 2 retries = 3 total calls
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('isRetryable', () => {
    it('should consider all errors retryable when no retryableErrors list', () => {
      expect(RetryHandler.isRetryable(new Error('anything'))).toBe(true);
    });

    it('should match on error message', () => {
      expect(
        RetryHandler.isRetryable(new Error('TimeoutError occurred'), [
          'TimeoutError',
        ]),
      ).toBe(true);
    });

    it('should return false when error does not match any pattern', () => {
      expect(
        RetryHandler.isRetryable(new Error('AuthError'), ['TimeoutError']),
      ).toBe(false);
    });
  });
});
