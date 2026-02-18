import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import {
  Channel,
  FanoutMessage,
  PipelineTopics,
  RenderMessage,
} from '../interfaces/pipeline.interfaces';
import { IWorker, WorkerMetrics } from '../interfaces/worker.interface';

// ---------------------------------------------------------------------------
// Injection tokens for external dependencies
// ---------------------------------------------------------------------------

/**
 * Token for a subscriber resolver service.
 *
 * Expected shape:
 * ```ts
 * interface ISubscriberResolver {
 *   resolveByIds(orgId: string, subscriberIds: string[]): Promise<string[]>;
 *   resolveBySegment(orgId: string, segmentFilters: any[]): Promise<string[]>;
 * }
 * ```
 */
export const SUBSCRIBER_RESOLVER = Symbol('SUBSCRIBER_RESOLVER');

export interface ISubscriberResolver {
  resolveByIds(orgId: string, subscriberIds: string[]): Promise<string[]>;
  resolveBySegment(orgId: string, segmentFilters: any[]): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

@Injectable()
export class FanoutWorkerService implements OnModuleInit, IWorker {
  private readonly logger = new Logger(FanoutWorkerService.name);
  private running = false;

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private totalLatencyMs = 0;
  private lastProcessedAt: string | null = null;

  // Late-bound subscriber resolver
  private subscriberResolver: ISubscriberResolver | null = null;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
    @Optional()
    @Inject(SUBSCRIBER_RESOLVER)
    subscriberResolver?: ISubscriberResolver,
  ) {
    if (subscriberResolver) {
      this.subscriberResolver = subscriberResolver;
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.logger.log('Starting fanout worker...');
    await this.kafkaConsumer.subscribe(
      PipelineTopics.FANOUT,
      'fanout-workers',
      (message: FanoutMessage) => this.processFanoutMessage(message),
    );
    this.running = true;
    this.logger.log('Fanout worker started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger.log('Fanout worker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMetrics(): WorkerMetrics {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      avgLatencyMs:
        this.processedCount > 0
          ? this.totalLatencyMs / this.processedCount
          : 0,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  // -----------------------------------------------------------------------
  // Late binding
  // -----------------------------------------------------------------------

  /**
   * Allows late-binding of a subscriber resolver when the dependency
   * is not available at injection time (e.g. cross-module setup).
   */
  setSubscriberResolver(resolver: ISubscriberResolver): void {
    this.subscriberResolver = resolver;
    this.logger.log('Subscriber resolver bound');
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  async processFanoutMessage(message: FanoutMessage): Promise<void> {
    const start = Date.now();

    try {
      this.logger.debug(
        `Processing fanout message ${message.id} for org ${message.orgId}`,
      );

      // 1. Resolve target subscribers
      const subscriberIds = await this.resolveSubscribers(message);

      if (subscriberIds.length === 0) {
        this.logger.warn(
          `No subscribers resolved for fanout message ${message.id}`,
        );
        this.recordSuccess(start);
        return;
      }

      // 2. For each subscriber x channel, create a RenderMessage
      const renderMessages = this.buildRenderMessages(
        message,
        subscriberIds,
      );

      // 3. Publish RenderMessages in batch
      await this.publishBatch(renderMessages);

      // 4. Track metrics
      const fanoutRatio = renderMessages.length;
      this.logger.debug(
        `Fanout message ${message.id}: ${subscriberIds.length} subscribers x ${message.channels.length} channels = ${fanoutRatio} render messages`,
      );

      this.recordSuccess(start);
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to process fanout message ${message.id}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async resolveSubscribers(
    message: FanoutMessage,
  ): Promise<string[]> {
    // Single subscriber shortcut
    if (message.subscriberId) {
      return [message.subscriberId];
    }

    if (!this.subscriberResolver) {
      this.logger.warn(
        'No subscriber resolver configured. Returning subscriberId from message.',
      );
      return message.subscriberId ? [message.subscriberId] : [];
    }

    // Resolve from segment filters if present
    // (FanoutMessage in the actual interface only has subscriberId, but we
    //  support the broader use-case described in the spec via a cast)
    const extended = message as FanoutMessage & {
      subscriberIds?: string[];
      segmentFilters?: any[];
    };

    if (extended.subscriberIds && extended.subscriberIds.length > 0) {
      return this.subscriberResolver.resolveByIds(
        message.orgId,
        extended.subscriberIds,
      );
    }

    if (extended.segmentFilters && extended.segmentFilters.length > 0) {
      return this.subscriberResolver.resolveBySegment(
        message.orgId,
        extended.segmentFilters,
      );
    }

    return message.subscriberId ? [message.subscriberId] : [];
  }

  private buildRenderMessages(
    source: FanoutMessage,
    subscriberIds: string[],
  ): RenderMessage[] {
    const messages: RenderMessage[] = [];

    for (const subscriberId of subscriberIds) {
      for (const channel of source.channels) {
        const templateId = source.templateIds[channel] ?? source.templateIds['default'];
        if (!templateId) {
          this.logger.warn(
            `No template found for channel ${channel} in message ${source.id}, skipping`,
          );
          continue;
        }

        const renderMessage: RenderMessage = {
          id: uuidv4(),
          orgId: source.orgId,
          timestamp: new Date().toISOString(),
          traceId: source.traceId,
          subscriberId,
          channel: channel as Channel,
          templateId,
          variables: { ...source.variables },
          campaignId: source.campaignId,
          workflowId: source.workflowId,
        };

        messages.push(renderMessage);
      }
    }

    return messages;
  }

  private async publishBatch(messages: RenderMessage[]): Promise<void> {
    // Publish in parallel batches to keep throughput high
    const BATCH_SIZE = 100;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((msg) =>
          this.kafkaProducer.send(PipelineTopics.RENDER, msg),
        ),
      );
    }
  }

  private recordSuccess(startMs: number): void {
    const latency = Date.now() - startMs;
    this.processedCount++;
    this.totalLatencyMs += latency;
    this.lastProcessedAt = new Date().toISOString();
  }
}
