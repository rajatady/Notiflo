export interface RetryOptions {
  /** Maximum number of retries. Default 3 */
  maxRetries?: number;
  /** Initial delay in ms before first retry. Default 1000 */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries. Default 30000 */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff. Default 2 */
  backoffMultiplier?: number;
  /** List of error names/messages that are retryable. If not set, all errors are retried. */
  retryableErrors?: string[];
}

export class RetryHandler {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly retryableErrors?: string[];

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.retryableErrors = options.retryableErrors;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.maxRetries) {
          break;
        }

        if (!RetryHandler.isRetryable(lastError, this.retryableErrors)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determines whether an error is retryable.
   * If retryableErrors list is provided, checks if the error name or message
   * matches any entry. Otherwise, all errors are considered retryable.
   */
  static isRetryable(
    error: Error,
    retryableErrors?: string[],
  ): boolean {
    if (!retryableErrors || retryableErrors.length === 0) {
      return true;
    }

    return retryableErrors.some(
      (pattern) =>
        error.name.includes(pattern) || error.message.includes(pattern),
    );
  }

  private calculateDelay(attempt: number): number {
    const baseDelay =
      this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt);
    const capped = Math.min(baseDelay, this.maxDelayMs);
    // Add jitter: random value between 0 and 100% of the capped delay
    const jitter = Math.random() * capped;
    return Math.floor(capped + jitter) / 2 + capped / 2;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
