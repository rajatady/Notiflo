import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

const DEFAULT_TTL = 3600; // 1 hour in seconds

export interface CachedTemplate {
  templateId: string;
  version: string;
  channel: string;
  compiledTemplate: string;
}

@Injectable()
export class TemplateCacheService {
  private readonly logger = new Logger(TemplateCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private buildKey(templateId: string, version: string, channel: string): string {
    return `tpl:${templateId}:${version}:${channel}`;
  }

  async set(
    templateId: string,
    version: string,
    channel: string,
    compiledTemplate: string,
  ): Promise<void> {
    const key = this.buildKey(templateId, version, channel);
    try {
      await this.redis.set(key, compiledTemplate, 'EX', DEFAULT_TTL);
      this.logger.debug(`Cached template ${key}`);
    } catch (error) {
      this.logger.error(`Failed to cache template ${key}`, error);
      throw error;
    }
  }

  async get(
    templateId: string,
    version: string,
    channel: string,
  ): Promise<string | null> {
    const key = this.buildKey(templateId, version, channel);
    try {
      const value = await this.redis.get(key);
      if (value !== null) {
        // Refresh TTL on access
        await this.redis.expire(key, DEFAULT_TTL);
        this.logger.debug(`Cache hit for template ${key}`);
      } else {
        this.logger.debug(`Cache miss for template ${key}`);
      }
      return value;
    } catch (error) {
      this.logger.error(`Failed to get template ${key}`, error);
      throw error;
    }
  }

  async invalidate(templateId: string): Promise<number> {
    const pattern = `tpl:${templateId}:*`;
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
          // Strip keyPrefix if present since del uses the prefix automatically
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

      this.logger.debug(`Invalidated ${deleted} cached templates for ${templateId}`);
      return deleted;
    } catch (error) {
      this.logger.error(`Failed to invalidate templates for ${templateId}`, error);
      throw error;
    }
  }

  async warmup(templates: CachedTemplate[]): Promise<void> {
    this.logger.log(`Warming up cache with ${templates.length} templates`);
    const pipeline = this.redis.pipeline();
    for (const tpl of templates) {
      const key = this.buildKey(tpl.templateId, tpl.version, tpl.channel);
      pipeline.set(key, tpl.compiledTemplate, 'EX', DEFAULT_TTL);
    }
    try {
      await pipeline.exec();
      this.logger.log(`Cache warmup complete for ${templates.length} templates`);
    } catch (error) {
      this.logger.error('Cache warmup failed', error);
      throw error;
    }
  }
}
