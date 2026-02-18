import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TemplateCacheService } from './template-cache.service';
import { SubscriberCacheService } from './subscriber-cache.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface RedisModuleOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions = {}): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: options.host ?? 'localhost',
          port: options.port ?? 6379,
          password: options.password,
          db: options.db ?? 0,
          keyPrefix: options.keyPrefix,
        });
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider, TemplateCacheService, SubscriberCacheService],
      exports: [REDIS_CLIENT, TemplateCacheService, SubscriberCacheService],
      global: true,
    };
  }

  static forRootAsync(): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
          keyPrefix: configService.get<string>('REDIS_KEY_PREFIX'),
        });
      },
      inject: [ConfigService],
    };

    return {
      module: RedisModule,
      imports: [ConfigModule],
      providers: [redisProvider, TemplateCacheService, SubscriberCacheService],
      exports: [REDIS_CLIENT, TemplateCacheService, SubscriberCacheService],
      global: true,
    };
  }
}
