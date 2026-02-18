import { DynamicModule, Module, Provider } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaAdminService } from './kafka-admin.service';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const KAFKA_MODULE_OPTIONS = 'KAFKA_MODULE_OPTIONS';

export interface KafkaModuleOptions {
  /** Kafka broker addresses, e.g. ['localhost:9092'] */
  brokers: string[];
  /** KafkaJS client id */
  clientId?: string;
  /** Producer: flush interval in ms (default 100) */
  producerFlushIntervalMs?: number;
  /** Producer: max buffer size before auto-flush (default 1000) */
  producerMaxBatchSize?: number;
  /** Number of partitions when auto-creating pipeline topics (default 6) */
  topicPartitions?: number;
  /** Replication factor when auto-creating pipeline topics (default 1) */
  topicReplicationFactor?: number;
}

export interface KafkaModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<KafkaModuleOptions> | KafkaModuleOptions;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

@Module({})
export class KafkaModule {
  /**
   * Synchronous registration.
   *
   * ```ts
   * KafkaModule.forRoot({ brokers: ['localhost:9092'] })
   * ```
   */
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: KAFKA_MODULE_OPTIONS,
      useValue: options,
    };

    return {
      module: KafkaModule,
      global: true,
      providers: [
        optionsProvider,
        KafkaProducerService,
        KafkaConsumerService,
        KafkaAdminService,
      ],
      exports: [
        KafkaProducerService,
        KafkaConsumerService,
        KafkaAdminService,
      ],
    };
  }

  /**
   * Async registration (e.g. when brokers come from ConfigService).
   *
   * ```ts
   * KafkaModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     brokers: config.get<string>('KAFKA_BROKERS', 'localhost:9092').split(','),
   *   }),
   * })
   * ```
   */
  static forRootAsync(asyncOptions: KafkaModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: KAFKA_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject ?? [],
    };

    return {
      module: KafkaModule,
      global: true,
      imports: asyncOptions.imports ?? [],
      providers: [
        optionsProvider,
        KafkaProducerService,
        KafkaConsumerService,
        KafkaAdminService,
      ],
      exports: [
        KafkaProducerService,
        KafkaConsumerService,
        KafkaAdminService,
      ],
    };
  }
}
