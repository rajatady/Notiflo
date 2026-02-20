import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { Db, MongoClient } from 'mongodb';
import {
  getApp,
  createOrg,
  createSubscriber,
  createTemplate,
  createAlert,
} from '../support/fixtures';
import { getTestDb, assertDocExists } from '../support/db';
import { getTestRedis, checkRedisAvailable } from '../support/redis';
import { closeApp } from '../support/app-factory';

const STREAM_KEY = 'notiflo:events:delivery';

describe('Alert Lifecycle E2E (Real DB)', () => {
  let app: INestApplication;
  let mongoClient: MongoClient;
  let db: Db;

  beforeAll(async () => {
    app = await getApp();
    ({ client: mongoClient, db } = await getTestDb());
  }, 30000);

  afterAll(async () => {
    await mongoClient?.close();
    await closeApp();
  });

  it('full lifecycle: org -> subscriber -> template -> alert -> tick -> match', async () => {
    // 1. Create organization
    const org = await createOrg(app, { name: 'Lifecycle Org' });
    expect(org._id).toBeDefined();

    // 2. Create subscriber
    const sub = await createSubscriber(app, org._id, {
      email: 'lifecycle@test.com',
      channelPreferences: { email: { enabled: true }, sms: { enabled: true } },
    });
    expect(sub._id).toBeDefined();

    // 3. Create template
    const template = await createTemplate(app, org._id);
    expect(template._id).toBeDefined();

    // 4. Create alert condition
    const alert = await createAlert(app, org._id, sub._id, {
      symbol: 'MSFT',
      strategyParams: { threshold: 400, operator: 'cross_above' },
      templateId: template._id,
    });
    expect(alert._id).toBeDefined();

    // Verify condition loaded in engine
    const countRes = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);
    expect(countRes.body.count).toBeGreaterThanOrEqual(1);

    // 5. Submit tick that triggers match
    const tickRes = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'MSFT', value: 450, timestampUs: Date.now() * 1000 })
      .expect(200);

    expect(tickRes.body.count).toBe(1);
    expect(tickRes.body.matches).toHaveLength(1);
    expect(tickRes.body.matches[0].symbol).toBe('MSFT');
    expect(tickRes.body.matches[0].matchedValue).toBe(450);

    // 6. Submit tick below threshold — no match
    const noMatchRes = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'MSFT', value: 350, timestampUs: Date.now() * 1000 })
      .expect(200);
    expect(noMatchRes.body.count).toBe(0);

    // 7. Verify alert is stored correctly in MongoDB
    await assertDocExists(db, 'alertconditions', { symbol: 'MSFT' });

    // 8. Verify subscriber in MongoDB
    await assertDocExists(db, 'subscribers', { email: 'lifecycle@test.com' });

    // 9. Dashboard endpoints work
    const engineRes = await request(app.getHttpServer())
      .get('/dashboard/engine')
      .expect(200);
    expect(engineRes.body.available).toBe(true);

    const overviewRes = await request(app.getHttpServer())
      .get(`/dashboard/overview?orgId=${org._id}`)
      .expect(200);
    expect(overviewRes.body).toHaveProperty('totalNotificationsSent');

    // 10. Delete alert and verify
    await request(app.getHttpServer())
      .delete(`/alerts/${alert._id}`)
      .expect(200);

    const afterCount = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);
    expect(afterCount.body.count).toBeLessThan(countRes.body.count);
  }, 30000);

  it('delivery event flows from Redis stream to MongoDB notification (requires Redis)', async () => {
    const redisAvailable = await checkRedisAvailable();
    if (!redisAvailable) {
      console.log('Skipped: Redis not available');
      return;
    }

    const org = await createOrg(app, { name: 'Stream Flow Org' });
    const redis = getTestRedis();
    const tsUs = String(Date.now() * 1000);

    try {
      // Ensure consumer group exists (race with NestJS consumer init)
      try {
        await redis.xgroup('CREATE', STREAM_KEY, 'notiflo-api', '0', 'MKSTREAM');
      } catch (e: any) {
        if (!e.message?.includes('BUSYGROUP')) throw e;
      }

      // Simulate what the Rust runtime does after delivery
      await redis.xadd(
        STREAM_KEY,
        '*',
        'request_id',    'req-e2e-flow',
        'condition_match_id', 'cond-e2e-flow',
        'organization_id', org._id,
        'subscriber_id', 'sub-e2e-flow',
        'channel',       'email',
        'provider',      'sendgrid',
        'success',       'true',
        'message_id',    'msg-e2e-flow',
        'error',         '',
        'latency_us',    '500',
        'timestamp_us',  tsUs,
      );

      // Wait for consumer to process
      await new Promise((r) => setTimeout(r, 3000));

      // Verify notification appeared in MongoDB
      const notification = await db.collection('notifications').findOne({
        organizationId: org._id,
      });

      expect(notification).not.toBeNull();
      expect(notification!.status).toBe('delivered');
      expect(notification!.channel).toBe('email');
    } finally {
      await redis.xtrim(STREAM_KEY, 'MAXLEN', 0);
      await redis.quit();
    }
  }, 10000);
});
