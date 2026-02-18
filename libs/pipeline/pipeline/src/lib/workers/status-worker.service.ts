import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';

import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { BatchAccumulator } from '../batch/batch-accumulator';
import {
  NotificationStatus,
  PipelineTopics,
  StatusMessage,
} from '../interfaces/pipeline.interfaces';
import { IWorker, WorkerMetrics } from '../interfaces/worker.interface';

// ---------------------------------------------------------------------------
// Injection tokens for external persistence services
// ---------------------------------------------------------------------------

/**
 * Token for a bulk writer that persists notification status records.
 *
 * Expected shape:
 * ```ts
 * interface IBulkWriterService {
 *   bulkUpdateNotificationStatus(updates: NotificationStatusUpdate[]): Promise<void>;
 *   bulkInsertAnalyticsEvents(events: AnalyticsEvent[]): Promise<void>;
 *   bulkUpdateCampaignAnalytics(updates: CampaignAnalyticsUpdate[]): Promise<void>;
 * }
 * ```
 */
export const BULK_WRITER_SERVICE = Symbol('BULK_WRITER_SERVICE');

export interface NotificationStatusUpdate {
  notificationId: string;
  orgId: string;
  subscriberId: string;
  channel: string;
  provider: string;
  status: string;
  error?: string;
  sentAt?: string;
  deliveredAt?: string;
  updatedAt: string;
}

export interface AnalyticsEvent {
  eventType: string;
  orgId: string;
  notificationId: string;
  subscriberId: string;
  channel: string;
  provider: string;
  status: string;
  campaignId?: string;
  workflowId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignAnalyticsUpdate {
  campaignId: string;
  orgId: string;
  channel: string;
  status: string;
  count: number;
  updatedAt: string;
}

export interface IBulkWriterService {
  bulkUpdateNotificationStatus(
    updates: NotificationStatusUpdate[],
  ): Promise<void>;
  bulkInsertAnalyticsEvents(events: AnalyticsEvent[]): Promise<void>;
  bulkUpdateCampaignAnalytics(
    updates: CampaignAnalyticsUpdate[],
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_BATCH_SIZE = 5000;
const STATUS_FLUSH_INTERVAL_MS = 200;

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

@Injectable()
export class StatusWorkerService
  implements OnModuleInit, OnModuleDestroy, IWorker
{
  private readonly logger = new Logger(StatusWorkerService.name);
  private running = false;

  // Batch accumulator for status messages
  private batchAccumulator: BatchAccumulator<StatusMessage>;

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private totalLatencyMs = 0;
  private lastProcessedAt: string | null = null;
  private flushedBatchCount = 0;

  // Late-bound bulk writer
  private bulkWriter: IBulkWriterService | null = null;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Optional()
    @Inject(BULK_WRITER_SERVICE)
    bulkWriter?: IBulkWriterService,
  ) {
    if (bulkWriter) {
      this.bulkWriter = bulkWriter;
    }

    this.batchAccumulator = new BatchAccumulator<StatusMessage>({
      maxBatchSize: STATUS_BATCH_SIZE,
      flushIntervalMs: STATUS_FLUSH_INTERVAL_MS,
      onFlush: (items) => this.handleFlush(items),
    });
  }

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

    this.logger.log('Starting status worker...');

    await this.kafkaConsumer.subscribe(
      PipelineTopics.STATUS,
      'status-workers',
      (message: StatusMessage) => this.processStatusMessage(message),
    );

    this.batchAccumulator.start();
    this.running = true;
    this.logger.log('Status worker started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.batchAccumulator.stop();

    // Final flush
    try {
      await this.batchAccumulator.flush();
    } catch (error) {
      this.logger.error('Error during final status batch flush', error);
    }

    this.logger.log('Status worker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMetrics(): WorkerMetrics & { flushedBatchCount: number } {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      avgLatencyMs:
        this.processedCount > 0
          ? this.totalLatencyMs / this.processedCount
          : 0,
      lastProcessedAt: this.lastProcessedAt,
      flushedBatchCount: this.flushedBatchCount,
    };
  }

  /**
   * Allows late-binding of a bulk writer when the dependency
   * is not available at injection time.
   */
  setBulkWriter(writer: IBulkWriterService): void {
    this.bulkWriter = writer;
    this.logger.log('Bulk writer service bound');
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  async processStatusMessage(message: StatusMessage): Promise<void> {
    const start = Date.now();

    try {
      this.logger.debug(
        `Processing status message ${message.id} [notification=${message.notificationId}, status=${message.status}]`,
      );

      await this.batchAccumulator.add(message);
      this.recordSuccess(start);
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to process status message ${message.id}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Flush handler
  // -----------------------------------------------------------------------

  private async handleFlush(messages: StatusMessage[]): Promise<void> {
    if (messages.length === 0) return;

    this.logger.debug(
      `Flushing ${messages.length} status messages`,
    );

    const flushStart = Date.now();

    try {
      // 1. Bulk write notification status updates
      await this.bulkUpdateNotificationRecords(messages);

      // 2. Bulk write analytics events (ClickHouse)
      await this.bulkInsertAnalytics(messages);

      // 3. Update campaign analytics for messages with campaignId
      await this.updateCampaignAnalytics(messages);

      this.flushedBatchCount++;
      this.logger.debug(
        `Status batch flush complete: ${messages.length} messages in ${Date.now() - flushStart}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Status batch flush failed: ${err.message}`,
        err.stack,
      );
      throw error; // BatchAccumulator will put items back in the buffer
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async bulkUpdateNotificationRecords(
    messages: StatusMessage[],
  ): Promise<void> {
    if (!this.bulkWriter) {
      this.logger.warn(
        'No bulk writer configured. Notification status updates will be skipped.',
      );
      return;
    }

    const updates: NotificationStatusUpdate[] = messages.map((msg) => ({
      notificationId: msg.notificationId,
      orgId: msg.orgId,
      subscriberId: msg.subscriberId,
      channel: msg.channel,
      provider: msg.provider,
      status: msg.status,
      error: msg.error,
      sentAt: msg.sentAt,
      deliveredAt: msg.deliveredAt,
      updatedAt: new Date().toISOString(),
    }));

    await this.bulkWriter.bulkUpdateNotificationStatus(updates);
  }

  private async bulkInsertAnalytics(
    messages: StatusMessage[],
  ): Promise<void> {
    if (!this.bulkWriter) {
      this.logger.warn(
        'No bulk writer configured. Analytics events will be skipped.',
      );
      return;
    }

    const events: AnalyticsEvent[] = messages.map((msg) => ({
      eventType: this.statusToEventType(msg.status),
      orgId: msg.orgId,
      notificationId: msg.notificationId,
      subscriberId: msg.subscriberId,
      channel: msg.channel,
      provider: msg.provider,
      status: msg.status,
      campaignId: msg.campaignId,
      workflowId: msg.workflowId,
      timestamp: msg.timestamp,
    }));

    await this.bulkWriter.bulkInsertAnalyticsEvents(events);
  }

  private async updateCampaignAnalytics(
    messages: StatusMessage[],
  ): Promise<void> {
    if (!this.bulkWriter) return;

    // Group messages by campaignId + channel + status
    const campaignMessages = messages.filter((m) => m.campaignId);
    if (campaignMessages.length === 0) return;

    const grouped = new Map<string, CampaignAnalyticsUpdate>();

    for (const msg of campaignMessages) {
      const key = `${msg.campaignId}:${msg.channel}:${msg.status}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, {
          campaignId: msg.campaignId!,
          orgId: msg.orgId,
          channel: msg.channel,
          status: msg.status,
          count: 1,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const updates = Array.from(grouped.values());
    await this.bulkWriter.bulkUpdateCampaignAnalytics(updates);
  }

  private statusToEventType(status: NotificationStatus | string): string {
    switch (status) {
      case NotificationStatus.SENT:
        return 'notification.sent';
      case NotificationStatus.DELIVERED:
        return 'notification.delivered';
      case NotificationStatus.FAILED:
        return 'notification.failed';
      case NotificationStatus.BOUNCED:
        return 'notification.bounced';
      case NotificationStatus.OPENED:
        return 'notification.opened';
      case NotificationStatus.CLICKED:
        return 'notification.clicked';
      default:
        return `notification.${status}`;
    }
  }

  private recordSuccess(startMs: number): void {
    const latency = Date.now() - startMs;
    this.processedCount++;
    this.totalLatencyMs += latency;
    this.lastProcessedAt = new Date().toISOString();
  }
}
