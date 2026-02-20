import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { Db, MongoClient } from 'mongodb';
import { getTestDb, cleanCollections, assertDocExists, countDocs } from '../support/db';
import { getApp, createOrg, createSubscriber, createAlert } from '../support/fixtures';
import { closeApp } from '../support/app-factory';

describe('Alerts <-> MongoDB Integration', () => {
  let app: INestApplication;
  let mongoClient: MongoClient;
  let db: Db;
  let orgId: string;
  let subscriberId: string;

  beforeAll(async () => {
    app = await getApp();
    ({ client: mongoClient, db } = await getTestDb());

    const org = await createOrg(app);
    orgId = org._id;
    const sub = await createSubscriber(app, orgId);
    subscriberId = sub._id;
  }, 30000);

  afterAll(async () => {
    await mongoClient?.close();
    await closeApp();
  });

  beforeEach(async () => {
    await cleanCollections(db, ['alertconditions']);
  });

  it('persists alert to MongoDB with correct schema', async () => {
    const alert = await createAlert(app, orgId, subscriberId, {
      symbol: 'TSLA',
      strategyParams: { threshold: 200, operator: 'cross_above' },
    });

    // Verify directly in MongoDB — bypass the API layer
    const doc = await assertDocExists(db, 'alertconditions', {
      _id: new ObjectId(alert._id),
    });

    expect(doc.symbol).toBe('TSLA');
    expect(doc.strategyType).toBe('threshold_crossing');
    expect(doc.strategyParams.threshold).toBe(200);
    expect(doc.strategyParams.operator).toBe('cross_above');
    expect(doc.active).toBe(true);
    expect(doc.organizationId).toBe(orgId);
    expect(doc.subscriberId).toBe(subscriberId);
    expect(doc.channels).toEqual(['email']);
  });

  it('updates alert in MongoDB', async () => {
    const alert = await createAlert(app, orgId, subscriberId);

    await request(app.getHttpServer())
      .patch(`/alerts/${alert._id}`)
      .send({ name: 'Updated Alert Name' })
      .expect(200);

    const doc = await assertDocExists(db, 'alertconditions', {
      _id: new ObjectId(alert._id),
    });
    expect(doc.name).toBe('Updated Alert Name');
  });

  it('deletes alert from MongoDB', async () => {
    const alert = await createAlert(app, orgId, subscriberId);

    const before = await countDocs(db, 'alertconditions');
    expect(before).toBe(1);

    await request(app.getHttpServer())
      .delete(`/alerts/${alert._id}`)
      .expect(200);

    const after = await countDocs(db, 'alertconditions');
    expect(after).toBe(0);
  });

  it('persists multiple alerts and queries them', async () => {
    await createAlert(app, orgId, subscriberId, { symbol: 'AAPL' });
    await createAlert(app, orgId, subscriberId, { symbol: 'GOOG' });
    await createAlert(app, orgId, subscriberId, { symbol: 'TSLA' });

    const count = await countDocs(db, 'alertconditions');
    expect(count).toBe(3);

    // Verify via API too
    const res = await request(app.getHttpServer())
      .get(`/alerts?organizationId=${orgId}`)
      .expect(200);
    expect(res.body).toHaveLength(3);
  });
});
