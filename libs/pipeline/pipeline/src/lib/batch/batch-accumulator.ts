export interface BatchAccumulatorOptions<T> {
  /** Maximum items before auto-flush. Default 1000 */
  maxBatchSize?: number;
  /** Interval in ms for periodic flushing. Default 100 */
  flushIntervalMs?: number;
  /** Callback invoked when a batch is flushed */
  onFlush: (items: T[]) => Promise<void>;
}

/**
 * Generic batch accumulator that collects items and flushes them
 * either when a size threshold is reached or a time interval elapses.
 */
export class BatchAccumulator<T> {
  private buffer: T[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly onFlush: (items: T[]) => Promise<void>;
  private flushing = false;

  constructor(options: BatchAccumulatorOptions<T>) {
    this.maxBatchSize = options.maxBatchSize ?? 1000;
    this.flushIntervalMs = options.flushIntervalMs ?? 100;
    this.onFlush = options.onFlush;
  }

  /**
   * Add an item to the buffer. Auto-flushes when maxBatchSize is reached.
   */
  async add(item: T): Promise<void> {
    this.buffer.push(item);
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Manually flush the current buffer.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;

    this.flushing = true;
    const items = this.buffer.splice(0, this.buffer.length);
    try {
      await this.onFlush(items);
    } catch (error) {
      // Put items back at the front of the buffer on failure
      this.buffer.unshift(...items);
      throw error;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Start the periodic flush interval timer.
   */
  start(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch {
        // Errors during interval flush are silently caught;
        // items remain in buffer for the next flush attempt.
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop the periodic flush interval timer.
   */
  stop(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Returns the number of items currently in the buffer.
   */
  getPendingCount(): number {
    return this.buffer.length;
  }
}
