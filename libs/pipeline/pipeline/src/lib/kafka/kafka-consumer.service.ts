import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import {
  Kafka,
  Consumer,
  EachMessagePayload,
  EachBatchPayload,
  ConsumerConfig,
} from 'kafkajs';
import { KAFKA_MODULE_OPTIONS, KafkaModuleOptions } from './kafka.module';

export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;
export type BatchHandler = (payload: EachBatchPayload) => Promise<void>;

/**
 * Manages multiple Kafka consumers, one per subscription (topic + groupId).
 *
 * Each call to `subscribe()` or `subscribeBatch()` creates a dedicated
 * KafkaJS consumer so that different worker services can independently
 * consume from their own topics and consumer groups.
 */
@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumers: Consumer[] = [];

  constructor(
    @Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions,
  ) {
    this.kafka = new Kafka({
      clientId: options.clientId ?? 'notiflo-pipeline',
      brokers: options.brokers,
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Subscribe to a topic and process messages one at a time.
   */
  async subscribe(
    topic: string,
    groupId: string,
    handler: MessageHandler,
    consumerOverrides?: Partial<ConsumerConfig>,
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      ...consumerOverrides,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error(
            `Error processing message from ${topic} [partition ${payload.partition}]`,
            error,
          );
          // The message will be retried by the consumer (at-least-once)
        }
      },
    });

    this.consumers.push(consumer);
    this.logger.log(`Subscribed to ${topic} with group ${groupId}`);
    return consumer;
  }

  /**
   * Subscribe to a topic and process messages in batches.
   */
  async subscribeBatch(
    topic: string,
    groupId: string,
    handler: BatchHandler,
    consumerOverrides?: Partial<ConsumerConfig>,
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      ...consumerOverrides,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachBatch: async (payload) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error(
            `Error processing batch from ${topic}`,
            error,
          );
        }
      },
    });

    this.consumers.push(consumer);
    this.logger.log(`Subscribed (batch) to ${topic} with group ${groupId}`);
    return consumer;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Gracefully disconnect all consumers, committing current offsets.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting all Kafka consumers...');
    await Promise.all(
      this.consumers.map(async (consumer) => {
        try {
          await consumer.disconnect();
        } catch (err) {
          this.logger.error('Error disconnecting consumer', err);
        }
      }),
    );
    this.logger.log('All Kafka consumers disconnected');
  }
}
