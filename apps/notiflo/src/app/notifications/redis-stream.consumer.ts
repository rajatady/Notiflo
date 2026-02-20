import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { NotificationDocument } from './schemas/notification.schema';
import { NotificationStatus } from '../core';

const STREAM_KEY = 'notiflo:events:delivery';
const GROUP_NAME = 'notiflo-api';
const CONSUMER_NAME = 'notiflo-api-1';

@Injectable()
export class RedisStreamConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamConsumer.name);
  private redis: Redis | null = null;
  private running = false;

  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService?.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not configured — Redis stream consumer will not start.',
      );
      return;
    }

    try {
      this.redis = new Redis(redisUrl);
      await this.createConsumerGroup();
      this.running = true;
      this.consumeLoop();
    } catch (err) {
      this.logger.error('Failed to initialise Redis stream consumer', err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async createConsumerGroup(): Promise<void> {
    try {
      await this.redis!.xgroup(
        'CREATE',
        STREAM_KEY,
        GROUP_NAME,
        '0',
        'MKSTREAM',
      );
      this.logger.log(
        `Created consumer group "${GROUP_NAME}" on stream "${STREAM_KEY}"`,
      );
    } catch (err: any) {
      // BUSYGROUP means the group already exists — safe to ignore.
      if (err?.message?.includes('BUSYGROUP')) {
        this.logger.debug(`Consumer group "${GROUP_NAME}" already exists`);
      } else {
        throw err;
      }
    }
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        const results = await this.redis!.xreadgroup(
          'GROUP',
          GROUP_NAME,
          CONSUMER_NAME,
          'COUNT',
          '100',
          'BLOCK',
          '1000',
          'STREAMS',
          STREAM_KEY,
          '>',
        );

        if (!results || results.length === 0) {
          continue;
        }

        // results is [ [ streamKey, [ [id, fields], ... ] ] ]
        const [, entries] = results[0] as [string, [string, string[]][]];
        if (!entries || entries.length === 0) {
          continue;
        }

        const ackIds: string[] = [];

        for (const [id, fields] of entries) {
          try {
            const data = this.parseFields(fields);
            await this.persistNotification(data);
            ackIds.push(id);
          } catch (err) {
            this.logger.error(
              `Failed to process stream entry ${id}`,
              err,
            );
            // Still ACK to avoid infinite reprocessing; errors are logged.
            ackIds.push(id);
          }
        }

        if (ackIds.length > 0) {
          await this.redis!.xack(STREAM_KEY, GROUP_NAME, ...ackIds);
        }
      } catch (err) {
        if (this.running) {
          this.logger.error('Error in Redis stream consume loop', err);
          // Brief pause before retrying to avoid tight error loops.
          await this.sleep(2000);
        }
      }
    }
  }

  private parseFields(fields: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }
    return map;
  }

  private async persistNotification(
    data: Record<string, string>,
  ): Promise<void> {
    const success = data['success'] === 'true';

    const doc: Partial<NotificationDocument> = {
      organizationId: data['organization_id'],
      subscriberId: data['subscriber_id'],
      channel: data['channel'],
      provider: data['provider'],
      status: success
        ? NotificationStatus.DELIVERED
        : NotificationStatus.FAILED,
      result: {
        success,
        messageId: data['message_id'] || undefined,
        error: data['error'] || undefined,
      },
      metadata: {
        latencyUs: data['latency_us']
          ? Number(data['latency_us'])
          : undefined,
      },
      sentAt: data['timestamp_us']
        ? new Date(Number(data['timestamp_us']) / 1000)
        : undefined,
    };

    await this.notificationModel.create(doc);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
