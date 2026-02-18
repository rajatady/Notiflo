import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { REDIS_CLIENT } from '../cache/redis.module';
import { BatchAccumulator } from '../batch/batch-accumulator';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { RateLimiter } from '../resilience/rate-limiter';
import { RetryHandler } from '../resilience/retry';
import { DeadLetterService } from '../resilience/dead-letter';
import {
  Channel,
  DeliverMessage,
  NotificationStatus,
  PipelineTopics,
  StatusMessage,
} from '../interfaces/pipeline.interfaces';
import { IWorker, WorkerMetrics } from '../interfaces/worker.interface';

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface DeliveryResult {
  success: boolean;
  notificationId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface IChannelDeliveryProvider {
  /** Send a batch of messages via this provider. */
  sendBatch(messages: DeliverMessage[]): Promise<DeliveryResult[]>;
  /** Send a single message. */
  send(message: DeliverMessage): Promise<DeliveryResult>;
  /** The provider name (e.g. 'ses', 'twilio'). */
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEDUP_TTL_SECONDS = 3600; // 1 hour
const DEDUP_KEY_PREFIX = 'dedup:deliver:';
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 200;
const MAX_RETRIES = 3;

/**
 * Channels that the deliver worker subscribes to by default.
 * Additional channels can be added via registerProvider().
 */
const DEFAULT_CHANNELS: Channel[] = [
  Channel.EMAIL,
  Channel.SMS,
  Channel.PUSH,
  Channel.WHATSAPP,
  Channel.IN_APP,
  Channel.WEBHOOK,
  Channel.SLACK,
];

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

@Injectable()
export class DeliverWorkerService
  implements OnModuleInit, OnModuleDestroy, IWorker
{
  private readonly logger = new Logger(DeliverWorkerService.name);
  private running = false;

  // Per-channel infrastructure
  private readonly batches = new Map<string, BatchAccumulator<DeliverMessage>>();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly rateLimiters = new Map<string, RateLimiter>();
  private readonly providers = new Map<string, IChannelDeliveryProvider>();

  // Shared
  private readonly retryHandler = new RetryHandler({ maxRetries: MAX_RETRIES });

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private totalLatencyMs = 0;
  private lastProcessedAt: string | null = null;
  private dedupHitCount = 0;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly deadLetterService: DeadLetterService,
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.logger.log('Starting deliver worker...');

    // Subscribe to channel-specific deliver topics
    for (const channel of DEFAULT_CHANNELS) {
      await this.subscribeToChannel(channel);
    }

    this.running = true;
    this.logger.log('Deliver worker started');
  }

  async stop(): Promise<void> {
    this.running = false;

    // Flush and stop all batch accumulators
    for (const [channel, batch] of this.batches) {
      this.logger.debug(`Flushing batch accumulator for channel ${channel}`);
      batch.stop();
      try {
        await batch.flush();
      } catch (error) {
        this.logger.error(
          `Error flushing batch for channel ${channel}`,
          error,
        );
      }
    }

    // Stop all rate limiters
    for (const [, limiter] of this.rateLimiters) {
      limiter.stop();
    }

    this.logger.log('Deliver worker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMetrics(): WorkerMetrics & { dedupHitCount: number } {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      avgLatencyMs:
        this.processedCount > 0
          ? this.totalLatencyMs / this.processedCount
          : 0,
      lastProcessedAt: this.lastProcessedAt,
      dedupHitCount: this.dedupHitCount,
    };
  }

  // -----------------------------------------------------------------------
  // Provider registration
  // -----------------------------------------------------------------------

  /**
   * Register a delivery provider for a specific channel.
   * This enables the worker to deliver messages on that channel.
   */
  registerProvider(
    channel: string,
    provider: IChannelDeliveryProvider,
  ): void {
    this.providers.set(channel, provider);
    this.logger.log(
      `Registered delivery provider "${provider.name}" for channel "${channel}"`,
    );
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  async processDeliverMessage(message: DeliverMessage): Promise<void> {
    const start = Date.now();

    try {
      this.logger.debug(
        `Processing deliver message ${message.id} [channel=${message.channel}, provider=${message.provider}]`,
      );

      // 1. Check deduplication
      const idempotencyKey = (message as any).idempotencyKey ?? message.id;
      const isDuplicate = await this.checkDeduplication(idempotencyKey);

      if (isDuplicate) {
        this.dedupHitCount++;
        this.logger.debug(
          `Duplicate delivery detected for key ${idempotencyKey}, skipping`,
        );
        this.recordSuccess(start);
        return;
      }

      // 2. Add to batch accumulator for the channel
      const batch = this.getOrCreateBatch(message.channel);
      await batch.add(message);

      this.recordSuccess(start);
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to process deliver message ${message.id}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async subscribeToChannel(channel: Channel): Promise<void> {
    const topic = `${PipelineTopics.DELIVER}.${channel}`;
    const groupId = `deliver-workers-${channel}`;

    this.logger.debug(
      `Subscribing to topic ${topic} with group ${groupId}`,
    );

    await this.kafkaConsumer.subscribe(topic, groupId, (message: DeliverMessage) =>
      this.processDeliverMessage(message),
    );
  }

  private getOrCreateBatch(
    channel: string,
  ): BatchAccumulator<DeliverMessage> {
    let batch = this.batches.get(channel);
    if (batch) return batch;

    batch = new BatchAccumulator<DeliverMessage>({
      maxBatchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      onFlush: (items) => this.handleBatchFlush(channel, items),
    });
    batch.start();
    this.batches.set(channel, batch);

    return batch;
  }

  private getOrCreateCircuitBreaker(provider: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(provider);
    if (cb) return cb;

    cb = new CircuitBreaker(provider, {
      failureThreshold: 0.5,
      windowMs: 10_000,
      resetTimeoutMs: 30_000,
    });
    this.circuitBreakers.set(provider, cb);
    return cb;
  }

  private getOrCreateRateLimiter(provider: string): RateLimiter {
    let rl = this.rateLimiters.get(provider);
    if (rl) return rl;

    rl = new RateLimiter(provider, {
      maxTokens: 100,
      refillRate: 50,
      refillIntervalMs: 1000,
    });
    rl.start();
    this.rateLimiters.set(provider, rl);
    return rl;
  }

  /**
   * Called when a batch accumulator flushes for a given channel.
   * Sends the batch through circuit breaker + rate limiter, then publishes status messages.
   */
  private async handleBatchFlush(
    channel: string,
    messages: DeliverMessage[],
  ): Promise<void> {
    if (messages.length === 0) return;

    const provider = this.providers.get(channel);
    const providerName = messages[0]?.provider ?? channel;
    const circuitBreaker = this.getOrCreateCircuitBreaker(providerName);
    const rateLimiter = this.getOrCreateRateLimiter(providerName);

    if (!provider) {
      this.logger.warn(
        `No delivery provider registered for channel "${channel}". ` +
          `${messages.length} messages will be dead-lettered.`,
      );
      // Dead-letter all messages
      for (const msg of messages) {
        await this.deadLetterMessage(
          msg,
          new Error(`No provider for channel ${channel}`),
        );
      }
      return;
    }

    try {
      // Acquire rate limiter tokens for the batch
      await rateLimiter.acquire(messages.length);

      // Execute through circuit breaker
      const results = await circuitBreaker.execute(() =>
        provider.sendBatch(messages),
      );

      // Process results
      await this.processDeliveryResults(messages, results);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Batch delivery failed for channel ${channel}: ${err.message}`,
      );

      // Attempt individual retries for each message
      await this.retryIndividualMessages(channel, messages, provider);
    }
  }

  private async processDeliveryResults(
    messages: DeliverMessage[],
    results: DeliveryResult[],
  ): Promise<void> {
    const statusMessages: StatusMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const result = results[i];

      if (!result) continue;

      const statusMessage: StatusMessage = {
        id: uuidv4(),
        orgId: msg.orgId,
        timestamp: new Date().toISOString(),
        traceId: msg.traceId,
        notificationId: result.notificationId ?? msg.id,
        subscriberId: msg.subscriberId,
        channel: msg.channel,
        provider: msg.provider,
        status: result.success
          ? NotificationStatus.SENT
          : NotificationStatus.FAILED,
        error: result.error,
        campaignId: msg.campaignId,
        workflowId: msg.workflowId,
        sentAt: result.success ? new Date().toISOString() : undefined,
      };

      statusMessages.push(statusMessage);
    }

    // Publish all status messages
    await Promise.all(
      statusMessages.map((s) =>
        this.kafkaProducer.send(PipelineTopics.STATUS, s),
      ),
    );
  }

  private async retryIndividualMessages(
    channel: string,
    messages: DeliverMessage[],
    provider: IChannelDeliveryProvider,
  ): Promise<void> {
    for (const msg of messages) {
      try {
        const result = await this.retryHandler.execute(() =>
          provider.send(msg),
        );

        const statusMessage: StatusMessage = {
          id: uuidv4(),
          orgId: msg.orgId,
          timestamp: new Date().toISOString(),
          traceId: msg.traceId,
          notificationId: result.notificationId ?? msg.id,
          subscriberId: msg.subscriberId,
          channel: msg.channel,
          provider: msg.provider,
          status: result.success
            ? NotificationStatus.SENT
            : NotificationStatus.FAILED,
          error: result.error,
          campaignId: msg.campaignId,
          workflowId: msg.workflowId,
          sentAt: result.success ? new Date().toISOString() : undefined,
        };

        await this.kafkaProducer.send(PipelineTopics.STATUS, statusMessage);
      } catch (error) {
        // Max retries exhausted -- dead-letter
        await this.deadLetterMessage(msg, error);
      }
    }
  }

  private async deadLetterMessage(
    message: DeliverMessage,
    error: unknown,
  ): Promise<void> {
    this.failedCount++;
    const err = error instanceof Error ? error : new Error(String(error));

    this.logger.error(
      `Dead-lettering deliver message ${message.id}: ${err.message}`,
    );

    try {
      await this.deadLetterService.send(
        `${PipelineTopics.DELIVER}.${message.channel}`,
        message,
        err,
        MAX_RETRIES,
      );
    } catch (dlqError) {
      this.logger.error(
        `Failed to dead-letter message ${message.id}`,
        dlqError,
      );
    }

    // Also publish a FAILED status
    const statusMessage: StatusMessage = {
      id: uuidv4(),
      orgId: message.orgId,
      timestamp: new Date().toISOString(),
      traceId: message.traceId,
      notificationId: message.id,
      subscriberId: message.subscriberId,
      channel: message.channel,
      provider: message.provider,
      status: NotificationStatus.FAILED,
      error: err.message,
      campaignId: message.campaignId,
      workflowId: message.workflowId,
    };

    try {
      await this.kafkaProducer.send(PipelineTopics.STATUS, statusMessage);
    } catch (statusError) {
      this.logger.error(
        `Failed to publish failure status for message ${message.id}`,
        statusError,
      );
    }
  }

  private async checkDeduplication(
    idempotencyKey: string,
  ): Promise<boolean> {
    const key = `${DEDUP_KEY_PREFIX}${idempotencyKey}`;

    try {
      // SETNX returns 1 if the key was set (not a duplicate), 0 if it already existed
      const result = await this.redis.set(
        key,
        '1',
        'EX',
        DEDUP_TTL_SECONDS,
        'NX',
      );
      return result === null; // null means key already existed
    } catch (error) {
      this.logger.warn(
        `Deduplication check failed for key ${idempotencyKey}, allowing message through`,
        error,
      );
      return false;
    }
  }

  private recordSuccess(startMs: number): void {
    const latency = Date.now() - startMs;
    this.processedCount++;
    this.totalLatencyMs += latency;
    this.lastProcessedAt = new Date().toISOString();
  }
}
