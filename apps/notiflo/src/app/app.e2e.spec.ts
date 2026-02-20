import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  ENGINE_BRIDGE,
  MockEngineBridgeService,
  EngineBridgeService,
} from '@notiflo/bridge/napi-bridge';
import { AppModule } from './app.module';

describe('Notiflo E2E - Alert Lifecycle', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      binary: { version: '7.0.0' },
    });
    const mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EngineBridgeService)
      .useClass(MockEngineBridgeService)
      .overrideProvider(ENGINE_BRIDGE)
      .useClass(MockEngineBridgeService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    delete process.env.MONGODB_URI;
  }, 15000);

  it('should complete the full alert lifecycle', async () => {
    // Create Organization
    const orgResponse = await request(app.getHttpServer())
      .post('/organizations')
      .send({
        name: 'Test Org',
        slug: 'test-org',
        description: 'E2E test organization',
      })
      .expect(201);

    const orgId = orgResponse.body._id;
    expect(orgId).toBeDefined();

    // Create Subscriber
    const subscriberResponse = await request(app.getHttpServer())
      .post('/subscribers')
      .send({
        organizationId: orgId,
        externalId: 'user-e2e-001',
        email: 'e2e@test.com',
        name: 'E2E Test User',
        phone: '+1234567890',
        channelPreferences: {
          email: { enabled: true },
          sms: { enabled: true },
        },
      })
      .expect(201);

    const subscriberId = subscriberResponse.body._id;
    expect(subscriberId).toBeDefined();

    // Create Email Template
    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .send({
        organizationId: orgId,
        name: 'Price Alert Template',
        description: 'Template for price alerts',
        channels: {
          email: {
            subject: 'Price Alert: {{symbol}} is now ${{matchedValue}}',
            body: '<h1>Alert!</h1><p>{{symbol}} has crossed your threshold.</p>',
          },
        },
        variables: [
          { name: 'symbol', type: 'string', required: true },
          { name: 'matchedValue', type: 'number', required: true },
        ],
        tags: ['alert', 'price'],
      })
      .expect(201);

    const templateId = templateResponse.body._id;
    expect(templateId).toBeDefined();

    // Create Threshold Crossing Alert
    const alertResponse = await request(app.getHttpServer())
      .post('/alerts')
      .send({
        organizationId: orgId,
        subscriberId: subscriberId,
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: {
          threshold: 150,
          operator: 'cross_above',
        },
        channels: ['email'],
        templateId: templateId,
        active: true,
        name: 'AAPL Price Alert',
      })
      .expect(201);

    const alertId = alertResponse.body._id;
    expect(alertId).toBeDefined();
    expect(alertResponse.body.symbol).toBe('AAPL');

    // Verify Engine Has Condition Loaded
    const countResponse = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);

    expect(countResponse.body.count).toBeGreaterThanOrEqual(1);

    // Submit Tick — Expect Match
    const tickResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({
        symbol: 'AAPL',
        value: 160,
        timestampUs: Date.now() * 1000,
      })
      .expect(200);

    expect(tickResponse.body.count).toBe(1);
    expect(tickResponse.body.matches).toHaveLength(1);
    expect(tickResponse.body.matches[0].symbol).toBe('AAPL');

    // Submit Tick Below Threshold — No Match
    const noMatchResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({
        symbol: 'AAPL',
        value: 140,
        timestampUs: Date.now() * 1000,
      })
      .expect(200);

    expect(noMatchResponse.body.count).toBe(0);

    // Verify Engine Metrics
    const metricsResponse = await request(app.getHttpServer())
      .get('/alerts/metrics')
      .expect(200);

    expect(metricsResponse.body.totalConditions).toBeGreaterThanOrEqual(1);
    expect(metricsResponse.body.totalTicksProcessed).toBeGreaterThanOrEqual(2);

    // Dashboard Engine Endpoint
    const dashboardEngineResponse = await request(app.getHttpServer())
      .get('/dashboard/engine')
      .expect(200);

    expect(dashboardEngineResponse.body.available).toBe(true);

    // Delete Alert
    await request(app.getHttpServer())
      .delete(`/alerts/${alertId}`)
      .expect(200);

    const countAfterDelete = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);

    expect(countAfterDelete.body.count).toBeLessThan(countResponse.body.count);
  }, 30000);

  it('should handle tick for unmatched symbol gracefully', async () => {
    const response = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({
        symbol: 'UNKNOWN_SYMBOL',
        value: 999,
        timestampUs: Date.now() * 1000,
      })
      .expect(200);

    expect(response.body.count).toBe(0);
  });

  describe('Dashboard API E2E', () => {
    it('should return engine status', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/engine')
        .expect(200);

      expect(res.body).toHaveProperty('available');
    });

    it('should return overview for an org', async () => {
      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Dashboard Org', slug: 'dashboard-org' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/dashboard/overview?orgId=${orgRes.body._id}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalNotificationsSent');
      expect(res.body).toHaveProperty('deliveryRate');
      expect(res.body).toHaveProperty('channelBreakdown');
    });

    it('should return channel health for an org', async () => {
      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Channel Health Org', slug: 'channel-health-org' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/dashboard/channels?orgId=${orgRes.body._id}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
