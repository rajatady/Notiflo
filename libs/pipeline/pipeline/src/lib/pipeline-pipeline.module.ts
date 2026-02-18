import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PipelinePipelineService } from './pipeline-pipeline.service';
import { KafkaModule } from './kafka/kafka.module';
import { RedisModule } from './cache/redis.module';
import { DeadLetterService } from './resilience/dead-letter';
import { FanoutWorkerService } from './workers/fanout-worker.service';
import { RenderWorkerService } from './workers/render-worker.service';
import { DeliverWorkerService } from './workers/deliver-worker.service';
import { StatusWorkerService } from './workers/status-worker.service';

@Module({
	controllers: [],
	providers: [
		PipelinePipelineService,
		DeadLetterService,
		FanoutWorkerService,
		RenderWorkerService,
		DeliverWorkerService,
		StatusWorkerService,
	],
	exports: [PipelinePipelineService],
	imports: [
		KafkaModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				brokers: config
					.get<string>('KAFKA_BROKERS', 'localhost:9092')
					.split(','),
				clientId: config.get<string>('KAFKA_CLIENT_ID', 'notiflo-pipeline'),
			}),
		}),
		RedisModule,
	],
})
export class PipelinePipelineModule {}
