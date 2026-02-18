import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Track all MongoMemoryServer instances so they can be independently stopped.
 */
const mongodInstances: MongoMemoryServer[] = [];

/**
 * Provides a MongooseModule connected to an in-memory MongoDB instance.
 * Each call creates its own independent MongoMemoryServer, avoiding
 * conflicts when test suites run in parallel.
 *
 * Uses MongoDB 7.0.0 which has proper Ubuntu 24.04 support.
 */
export const rootMongooseTestModule = (options: MongooseModuleOptions = {}) =>
  MongooseModule.forRootAsync({
    useFactory: async () => {
      const mongod = await MongoMemoryServer.create({
        binary: {
          version: '7.0.0',
        },
      });
      mongodInstances.push(mongod);
      const mongoUri = mongod.getUri();
      return {
        uri: mongoUri,
        ...options,
      };
    },
  });

/**
 * Close all in-memory MongoDB instances and cleanup.
 * Call this in afterAll() of your test suite.
 */
export const closeMongoConnection = async () => {
  for (const mongod of mongodInstances) {
    if (mongod) {
      await mongod.stop();
    }
  }
  mongodInstances.length = 0;
};
