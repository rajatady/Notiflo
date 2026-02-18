import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Kafka, Producer, Message, TopicMessages } from 'kafkajs';
import { KAFKA_MODULE_OPTIONS, KafkaModuleOptions } from './kafka.module';

/**
 * Buffered Kafka producer.
 *
 * Messages are collected in an internal buffer and flushed either when
 * the batch-size threshold is reached or every `flushIntervalMs`
 * milliseconds -- whichever comes first.
 */
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  /** Internal buffer: topic -> messages[] */
  private buffer = new Map<string, Message[]>();
  private flushTimer: NodeJS.Timeout | null = null;

  /** Configuration knobs */
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;

  constructor(
    @Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions,
  ) {
    this.flushIntervalMs = options.producerFlushIntervalMs ?? 100;
    this.maxBatchSize = options.producerMaxBatchSize ?? 1000;

    this.kafka = new Kafka({
      clientId: options.clientId ?? 'notiflo-pipeline',
      brokers: options.brokers,
    });

    this.producer = this.kafka.producer();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    this.startFlushInterval();
    this.logger.log('Kafka producer connected');
  }

  async disconnect(): Promise<void> {
    this.stopFlushInterval();
    await this.flush();
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Enqueue one or more messages for a single topic.
   * Messages are buffered and sent in batches.
   */
  async send(topic: string, messages: Message[]): Promise<void> {
    const existing = this.buffer.get(topic) ?? [];
    existing.push(...messages);
    this.buffer.set(topic, existing);

    if (this.currentBufferSize() >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Enqueue messages targeting multiple topics at once.
   */
  async sendBatch(topicMessages: TopicMessages[]): Promise<void> {
    for (const tm of topicMessages) {
      const existing = this.buffer.get(tm.topic) ?? [];
      existing.push(...(tm.messages as Message[]));
      this.buffer.set(tm.topic, existing);
    }

    if (this.currentBufferSize() >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Immediately flush the entire buffer to Kafka.
   */
  async flush(): Promise<void> {
    if (this.buffer.size === 0) {
      return;
    }

    const topicMessages: TopicMessages[] = [];

    for (const [topic, messages] of this.buffer.entries()) {
      if (messages.length > 0) {
        topicMessages.push({ topic, messages });
      }
    }

    this.buffer.clear();

    if (topicMessages.length === 0) {
      return;
    }

    try {
      await this.producer.sendBatch({ topicMessages });
    } catch (error) {
      this.logger.error('Failed to flush producer buffer', error);
      // Re-enqueue on failure so messages are not silently lost
      for (const tm of topicMessages) {
        const existing = this.buffer.get(tm.topic) ?? [];
        existing.push(...(tm.messages as Message[]));
        this.buffer.set(tm.topic, existing);
      }
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private currentBufferSize(): number {
    let size = 0;
    for (const msgs of this.buffer.values()) {
      size += msgs.length;
    }
    return size;
  }

  private startFlushInterval(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (err) {
        this.logger.error('Periodic flush failed', err);
      }
    }, this.flushIntervalMs);
  }

  private stopFlushInterval(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
