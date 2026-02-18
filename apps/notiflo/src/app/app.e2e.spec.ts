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

/**
 * End-to-end integration test for the complete Notiflo alert lifecycle.
 *
 * Uses MongoMemoryServer (real MongoDB) and MockEngineBridgeService
 * (pure JS — no compiled Rust addon needed).
 */
describe('Notiflo E2E - Alert Lifecycle', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    // AppModule reads MONGODB_URI via database.configuration.ts
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
    // ─── Step 1: Create Organization ───
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

    // ─── Step 2: Create Subscriber ───
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

    // ─── Step 3: Create Email Template ───
    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .send({
        organizationId: orgId,
        name: 'Price Alert Template',
        description: 'Template for price alerts',
        channels: {
          email: {
            subject: 'Price Alert: {{symbol}} is now ${{matchedValue}}',
            body: '<h1>Alert!</h1><p>{{symbol}} has crossed your threshold. Current price: ${{matchedValue}}.</p>',
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

    // ─── Step 4: Create Threshold Crossing Alert ───
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
        description: 'Alert when AAPL crosses above $150',
      })
      .expect(201);

    const alertId = alertResponse.body._id;
    expect(alertId).toBeDefined();
    expect(alertResponse.body.symbol).toBe('AAPL');
    expect(alertResponse.body.active).toBe(true);

    // ─── Step 5: Verify Engine Has Condition Loaded ───
    const countResponse = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);

    expect(countResponse.body.count).toBeGreaterThanOrEqual(1);

    // ─── Step 6: Submit Tick → Expect Match ───
    const tickResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({
        symbol: 'AAPL',
        value: 160, // Above threshold of 150
        timestampUs: Date.now() * 1000,
      })
      .expect(200);

    expect(tickResponse.body.count).toBe(1);
    expect(tickResponse.body.matches).toHaveLength(1);
    expect(tickResponse.body.matches[0].symbol).toBe('AAPL');
    expect(tickResponse.body.matches[0].matchedValue).toBe(160);
    expect(tickResponse.body.matches[0].subscriberId).toBe(subscriberId);

    // ─── Step 7: Submit Tick Below Threshold → No Match ───
    const noMatchResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({
        symbol: 'AAPL',
        value: 140, // Below threshold of 150
        timestampUs: Date.now() * 1000,
      })
      .expect(200);

    expect(noMatchResponse.body.count).toBe(0);
    expect(noMatchResponse.body.matches).toHaveLength(0);

    // ─── Step 8: Verify Engine Metrics ───
    const metricsResponse = await request(app.getHttpServer())
      .get('/alerts/metrics')
      .expect(200);

    expect(metricsResponse.body.totalConditions).toBeGreaterThanOrEqual(1);
    expect(metricsResponse.body.totalTicksProcessed).toBeGreaterThanOrEqual(2);
    expect(metricsResponse.body.totalMatches).toBeGreaterThanOrEqual(1);

    // ─── Step 9: Dashboard Engine Endpoint ───
    const dashboardEngineResponse = await request(app.getHttpServer())
      .get('/dashboard/engine')
      .expect(200);

    expect(dashboardEngineResponse.body.available).toBe(true);
    expect(dashboardEngineResponse.body.totalConditions).toBeGreaterThanOrEqual(1);

    // ─── Step 10: Verify Alert Shows in List ───
    const alertsListResponse = await request(app.getHttpServer())
      .get(`/alerts?organizationId=${orgId}`)
      .expect(200);

    expect(alertsListResponse.body.length).toBeGreaterThanOrEqual(1);
    const found = alertsListResponse.body.find(
      (a: any) => a.symbol === 'AAPL',
    );
    expect(found).toBeDefined();

    // ─── Step 11: Delete Alert ───
    await request(app.getHttpServer())
      .delete(`/alerts/${alertId}`)
      .expect(200);

    // Verify engine condition count decreased
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
    expect(response.body.matches).toHaveLength(0);
  });

  it('should create and query alerts by symbol', async () => {
    const orgRes = await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Symbol Test Org', slug: 'symbol-test-org' })
      .expect(201);
    const orgId = orgRes.body._id;

    const subRes = await request(app.getHttpServer())
      .post('/subscribers')
      .send({
        organizationId: orgId,
        externalId: 'sub-symbol-test',
        email: 'symbol@test.com',
      })
      .expect(201);

    // Create alerts for different symbols
    await request(app.getHttpServer())
      .post('/alerts')
      .send({
        organizationId: orgId,
        subscriberId: subRes.body._id,
        symbol: 'MSFT',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 300, operator: 'cross_above' },
        channels: ['email'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/alerts')
      .send({
        organizationId: orgId,
        subscriberId: subRes.body._id,
        symbol: 'GOOGL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 2500, operator: 'cross_above' },
        channels: ['email'],
      })
      .expect(201);

    // Query by symbol
    const msftAlerts = await request(app.getHttpServer())
      .get(`/alerts/by-symbol?organizationId=${orgId}&symbol=MSFT`)
      .expect(200);

    expect(msftAlerts.body).toHaveLength(1);
    expect(msftAlerts.body[0].symbol).toBe('MSFT');

    // Submit tick for MSFT → should match
    const msftTick = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'MSFT', value: 350, timestampUs: Date.now() * 1000 })
      .expect(200);

    expect(msftTick.body.count).toBe(1);

    // Submit tick for GOOGL below threshold → should not match
    const googlTick = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'GOOGL', value: 2000, timestampUs: Date.now() * 1000 })
      .expect(200);

    expect(googlTick.body.count).toBe(0);
  }, 15000);
});
