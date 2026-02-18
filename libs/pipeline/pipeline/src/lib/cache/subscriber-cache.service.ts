import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

const DEFAULT_TTL = 900; // 15 minutes in seconds

export interface SubscriberData {
  subscriberId: string;
  orgId: string;
  email?: string;
  phone?: string;
  deviceTokens?: string[];
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class SubscriberCacheService {
  private readonly logger = new Logger(SubscriberCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private buildKey(orgId: string, subscriberId: string): string {
    return `sub:${orgId}:${subscriberId}`;
  }

  async get(orgId: string, subscriberId: string): Promise<SubscriberData | null> {
    const key = this.buildKey(orgId, subscriberId);
    try {
      const value = await this.redis.get(key);
      if (value !== null) {
        this.logger.debug(`Cache hit for subscriber ${key}`);
        return JSON.parse(value) as SubscriberData;
      }
      this.logger.debug(`Cache miss for subscriber ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to get subscriber ${key}`, error);
      throw error;
    }
  }

  async set(
    orgId: string,
    subscriberId: string,
    data: SubscriberData,
  ): Promise<void> {
    const key = this.buildKey(orgId, subscriberId);
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', DEFAULT_TTL);
      this.logger.debug(`Cached subscriber ${key}`);
    } catch (error) {
      this.logger.error(`Failed to cache subscriber ${key}`, error);
      throw error;
    }
  }

  async invalidate(orgId: string, subscriberId: string): Promise<void> {
    const key = this.buildKey(orgId, subscriberId);
    try {
      await this.redis.del(key);
      this.logger.debug(`Invalidated subscriber ${key}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate subscriber ${key}`, error);
      throw error;
    }
  }

  async invalidateOrg(orgId: string): Promise<number> {
    const pattern = `sub:${orgId}:*`;
    let deleted = 0;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          const keysToDelete = keys.map((k) => {
            const prefix = this.redis.options.keyPrefix ?? '';
            return prefix && k.startsWith(prefix)
              ? k.slice(prefix.length)
              : k;
          });
          const count = await this.redis.del(...keysToDelete);
          deleted += count;
        }
      } while (cursor !== '0');

      this.logger.debug(
        `Invalidated ${deleted} cached subscribers for org ${orgId}`,
      );
      return deleted;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate subscribers for org ${orgId}`,
        error,
      );
      throw error;
    }
  }
}
