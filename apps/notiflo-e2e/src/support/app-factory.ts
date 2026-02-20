import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  ENGINE_BRIDGE,
  MockEngineBridgeService,
  EngineBridgeService,
} from '@notiflo/bridge/napi-bridge';
import { AppModule } from '../../../../apps/notiflo/src/app/app.module';

let app: INestApplication | null = null;
let mongod: MongoMemoryServer | null = null;
let mongoUri: string | null = null;

/**
 * Lazily creates a NestJS application backed by a real MongoMemoryServer
 * instance. The app is a singleton — every spec file that calls this
 * receives the same running instance.
 */
export async function getOrCreateApp(): Promise<INestApplication> {
  if (app) return app;

  // Start real MongoDB via MongoMemoryServer (real binary, full wire-protocol compatibility)
  mongod = await MongoMemoryServer.create({
    binary: { version: '7.0.0' },
  });
  mongoUri = mongod.getUri();
  process.env.MONGODB_URI = mongoUri;

  // Ensure Redis URL is set (tests that need Redis will check availability separately)
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.REDIS_URL = redisUrl;

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

  return app;
}

/**
 * Returns the MongoMemoryServer URI.
 * Throws if the app has not been initialised yet.
 */
export function getMongoUri(): string {
  if (!mongoUri) {
    throw new Error(
      'App not initialized yet — call getOrCreateApp() first',
    );
  }
  return mongoUri;
}

/**
 * Gracefully shuts down the NestJS app and stops the in-memory MongoDB.
 * Safe to call multiple times.
 */
export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  mongoUri = null;
  delete process.env.MONGODB_URI;
}
