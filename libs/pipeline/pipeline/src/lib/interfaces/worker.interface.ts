/**
 * Contract that every pipeline worker must implement.
 */

export interface WorkerMetrics {
  /** Total number of messages processed successfully */
  processed: number;
  /** Total number of messages that failed processing */
  failed: number;
  /** Rolling average latency in milliseconds */
  avgLatencyMs: number;
  /** ISO-8601 timestamp of the last successfully processed message */
  lastProcessedAt: string | null;
}

export interface IWorker {
  /** Start consuming messages */
  start(): Promise<void>;
  /** Gracefully stop the worker */
  stop(): Promise<void>;
  /** Whether the worker is currently consuming */
  isRunning(): boolean;
  /** Return current worker metrics */
  getMetrics(): WorkerMetrics;
}
