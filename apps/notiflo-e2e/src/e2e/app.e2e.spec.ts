import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  getApp,
  createOrg,
  createSubscriber,
  createTemplate,
  createAlert,
} from '../support/fixtures';
import { closeApp } from '../support/app-factory';

describe('Notiflo E2E - Alert Lifecycle', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getApp();
  }, 30000);

  afterAll(async () => {
    await closeApp();
  });

  it('should complete the full alert lifecycle', async () => {
    const org = await createOrg(app, { name: 'Test Org' });
    expect(org._id).toBeDefined();

    const sub = await createSubscriber(app, org._id, {
      email: 'e2e@test.com',
      channelPreferences: {
        email: { enabled: true },
        sms: { enabled: true },
      },
    });
    expect(sub._id).toBeDefined();

    const template = await createTemplate(app, org._id);
    expect(template._id).toBeDefined();

    const alert = await createAlert(app, org._id, sub._id, {
      symbol: 'AAPL',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      templateId: template._id,
    });
    expect(alert._id).toBeDefined();
    expect(alert.symbol).toBe('AAPL');

    // Verify Engine Has Condition Loaded
    const countResponse = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);
    expect(countResponse.body.count).toBeGreaterThanOrEqual(1);

    // Submit Tick — Expect Match
    const tickResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'AAPL', value: 160, timestampUs: Date.now() * 1000 })
      .expect(200);
    expect(tickResponse.body.count).toBe(1);
    expect(tickResponse.body.matches).toHaveLength(1);
    expect(tickResponse.body.matches[0].symbol).toBe('AAPL');

    // Submit Tick Below Threshold — No Match
    const noMatchResponse = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'AAPL', value: 140, timestampUs: Date.now() * 1000 })
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
      .delete(`/alerts/${alert._id}`)
      .expect(200);

    const countAfterDelete = await request(app.getHttpServer())
      .get('/alerts/count')
      .expect(200);
    expect(countAfterDelete.body.count).toBeLessThan(countResponse.body.count);
  }, 30000);

  it('should handle tick for unmatched symbol gracefully', async () => {
    const response = await request(app.getHttpServer())
      .post('/alerts/ticks')
      .send({ symbol: 'UNKNOWN_SYMBOL', value: 999, timestampUs: Date.now() * 1000 })
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
      const org = await createOrg(app, { name: 'Dashboard Org' });
      const res = await request(app.getHttpServer())
        .get(`/dashboard/overview?orgId=${org._id}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalNotificationsSent');
      expect(res.body).toHaveProperty('deliveryRate');
      expect(res.body).toHaveProperty('channelBreakdown');
    });

    it('should return channel health for an org', async () => {
      const org = await createOrg(app, { name: 'Channel Health Org' });
      const res = await request(app.getHttpServer())
        .get(`/dashboard/channels?orgId=${org._id}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
