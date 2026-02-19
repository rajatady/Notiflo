import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { Db, MongoClient } from 'mongodb';
import { getApp, createOrg } from '../support/fixtures';
import { getTestDb, cleanCollections } from '../support/db';
import { getTestRedis, checkRedisAvailable } from '../support/redis';
import { closeApp } from '../support/app-factory';

const STREAM_KEY = 'notiflo:events:delivery';

describe('Redis Stream -> MongoDB Consumer Integration', () => {
  let app: INestApplication;
  let redis: Redis;
  let mongoClient: MongoClient;
  let db: Db;
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await checkRedisAvailable();
    if (!redisAvailable) {
      console.warn(
        'Redis not available — Redis stream tests will be skipped',
      );
      return;
    }

    app = await getApp();
    redis = getTestRedis();
    ({ client: mongoClient, db } = await getTestDb());
  }, 30000);

  afterAll(async () => {
    if (redis) await redis.quit();
    if (mongoClient) await mongoClient.close();
    await closeApp();
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    // Clean up stream and notifications
    await redis.del(STREAM_KEY);
    await cleanCollections(db, ['notifications']);
  });

  it('consumer writes successful delivery to MongoDB', async () => {
    if (!redisAvailable) {
      console.log('Skipped: Redis not available');
      return;
    }

    const orgId = `org-redis-test-${Date.now()}`;
    const subId = `sub-redis-test-${Date.now()}`;
    const tsUs = String(Date.now() * 1000);

    // Inject delivery event into Redis stream (mimics Rust runtime XADD)
    await redis.xadd(
      STREAM_KEY,
      '*',
      'request_id',    'req-001',
      'condition_match_id', 'cond-001',
      'organization_id', orgId,
      'subscriber_id', subId,
      'channel',       'email',
      'provider',      'sendgrid',
      'success',       'true',
      'message_id',    'msg-001',
      'error',         '',
      'latency_us',    '1234',
      'timestamp_us',  tsUs,
    );

    // Wait for NestJS consumer to pick it up (polls every 1s + 1s block)
    await new Promise((r) => setTimeout(r, 3000));

    const notification = await db.collection('notifications').findOne({
      organizationId: orgId,
      subscriberId: subId,
    });

    expect(notification).not.toBeNull();
    expect(notification!.status).toBe('delivered');
    expect(notification!.channel).toBe('email');
    expect(notification!.provider).toBe('sendgrid');
    expect(notification!.result.success).toBe(true);
    expect(notification!.result.messageId).toBe('msg-001');
  }, 10000);

  it('consumer marks failed delivery correctly', async () => {
    if (!redisAvailable) {
      console.log('Skipped: Redis not available');
      return;
    }

    const orgId = `org-fail-${Date.now()}`;

    await redis.xadd(
      STREAM_KEY,
      '*',
      'request_id',    'req-fail-001',
      'condition_match_id', 'cond-fail-001',
      'organization_id', orgId,
      'subscriber_id', 'sub-fail-001',
      'channel',       'sms',
      'provider',      'twilio',
      'success',       'false',
      'message_id',    '',
      'error',         'Connection timeout',
      'latency_us',    '5000',
      'timestamp_us',  String(Date.now() * 1000),
    );

    await new Promise((r) => setTimeout(r, 3000));

    const notification = await db.collection('notifications').findOne({
      organizationId: orgId,
    });

    expect(notification).not.toBeNull();
    expect(notification!.status).toBe('failed');
    expect(notification!.result.success).toBe(false);
    expect(notification!.result.error).toBe('Connection timeout');
  }, 10000);

  it('consumer processes a batch of events', async () => {
    if (!redisAvailable) {
      console.log('Skipped: Redis not available');
      return;
    }

    const orgId = `org-batch-${Date.now()}`;

    // Insert 5 events rapidly
    for (let i = 0; i < 5; i++) {
      await redis.xadd(
        STREAM_KEY,
        '*',
        'request_id',    `req-batch-${i}`,
        'condition_match_id', `cond-batch-${i}`,
        'organization_id', orgId,
        'subscriber_id', `sub-batch-${i}`,
        'channel',       'email',
        'provider',      'sendgrid',
        'success',       'true',
        'message_id',    `msg-batch-${i}`,
        'error',         '',
        'latency_us',    '100',
        'timestamp_us',  String(Date.now() * 1000),
      );
    }

    await new Promise((r) => setTimeout(r, 3000));

    const count = await db.collection('notifications').countDocuments({
      organizationId: orgId,
    });
    expect(count).toBe(5);
  }, 10000);
});
