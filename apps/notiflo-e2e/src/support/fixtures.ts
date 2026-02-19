import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getOrCreateApp } from './app-factory';

/**
 * Returns the shared NestJS application instance.
 * Ensures the app is booted before returning.
 */
export async function getApp(): Promise<INestApplication> {
  return getOrCreateApp();
}

/**
 * Creates an organization via the API and returns the response body.
 */
export async function createOrg(
  app: INestApplication,
  overrides: Record<string, any> = {},
): Promise<any> {
  const slug = `test-org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const res = await request(app.getHttpServer())
    .post('/organizations')
    .send({ name: 'Test Org', slug, ...overrides })
    .expect(201);
  return res.body;
}

/**
 * Creates a subscriber via the API and returns the response body.
 */
export async function createSubscriber(
  app: INestApplication,
  orgId: string,
  overrides: Record<string, any> = {},
): Promise<any> {
  const res = await request(app.getHttpServer())
    .post('/subscribers')
    .send({
      organizationId: orgId,
      externalId: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: `test-${Date.now()}@example.com`,
      channelPreferences: { email: { enabled: true } },
      ...overrides,
    })
    .expect(201);
  return res.body;
}

/**
 * Creates an alert condition via the API and returns the response body.
 */
export async function createAlert(
  app: INestApplication,
  orgId: string,
  subscriberId: string,
  overrides: Record<string, any> = {},
): Promise<any> {
  const res = await request(app.getHttpServer())
    .post('/alerts')
    .send({
      organizationId: orgId,
      subscriberId,
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      channels: ['email'],
      active: true,
      name: `Alert ${Date.now()}`,
      ...overrides,
    })
    .expect(201);
  return res.body;
}

/**
 * Creates a notification template via the API and returns the response body.
 */
export async function createTemplate(
  app: INestApplication,
  orgId: string,
  overrides: Record<string, any> = {},
): Promise<any> {
  const res = await request(app.getHttpServer())
    .post('/templates')
    .send({
      organizationId: orgId,
      name: `Template ${Date.now()}`,
      channels: {
        email: {
          subject: 'Alert: {{symbol}}',
          body: '{{symbol}} matched at {{matchedValue}}',
        },
      },
      variables: [
        { name: 'symbol', type: 'string', required: true },
        { name: 'matchedValue', type: 'number', required: true },
      ],
      ...overrides,
    })
    .expect(201);
  return res.body;
}
