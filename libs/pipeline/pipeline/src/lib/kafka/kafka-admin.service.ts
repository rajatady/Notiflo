import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { Kafka, Admin, ITopicConfig } from 'kafkajs';
import { PipelineTopics } from '../interfaces/pipeline.interfaces';
import { KAFKA_MODULE_OPTIONS, KafkaModuleOptions } from './kafka.module';

/** Default number of partitions per pipeline topic. */
const DEFAULT_NUM_PARTITIONS = 6;
/** Default replication factor (suitable for dev; override via options). */
const DEFAULT_REPLICATION_FACTOR = 1;

@Injectable()
export class KafkaAdminService implements OnModuleInit {
  private readonly logger = new Logger(KafkaAdminService.name);
  private readonly kafka: Kafka;
  private admin: Admin;

  private readonly numPartitions: number;
  private readonly replicationFactor: number;

  constructor(
    @Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions,
  ) {
    this.numPartitions = options.topicPartitions ?? DEFAULT_NUM_PARTITIONS;
    this.replicationFactor = options.topicReplicationFactor ?? DEFAULT_REPLICATION_FACTOR;

    this.kafka = new Kafka({
      clientId: options.clientId ?? 'notiflo-pipeline',
      brokers: options.brokers,
    });
    this.admin = this.kafka.admin();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.admin.connect();
    await this.createTopics();
    this.logger.log('Kafka admin connected and topics ensured');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Ensure all pipeline topics exist with the configured partition count.
   * Existing topics are left untouched (createTopics is idempotent).
   */
  async createTopics(): Promise<void> {
    const topics: ITopicConfig[] = Object.values(PipelineTopics).map(
      (topic) => ({
        topic,
        numPartitions: this.numPartitions,
        replicationFactor: this.replicationFactor,
      }),
    );

    const created = await this.admin.createTopics({ topics });

    if (created) {
      this.logger.log(
        `Created pipeline topics: ${Object.values(PipelineTopics).join(', ')}`,
      );
    } else {
      this.logger.debug('All pipeline topics already exist');
    }
  }

  /**
   * Return metadata for a single topic (partitions, replicas, ISR, etc.).
   */
  async getTopicMetadata(topic: string) {
    return this.admin.fetchTopicMetadata({ topics: [topic] });
  }

  /**
   * Return consumer group offsets for every topic the group subscribes to.
   * Useful for monitoring consumer lag.
   */
  async getConsumerGroupOffsets(groupId: string) {
    return this.admin.fetchOffsets({ groupId });
  }

  /**
   * Disconnect the admin client.
   */
  async disconnect(): Promise<void> {
    await this.admin.disconnect();
  }
}
