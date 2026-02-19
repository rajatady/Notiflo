import { MongoClient, Db } from 'mongodb';
import { getMongoUri } from './app-factory';

/**
 * Opens a raw MongoClient connection to the same in-memory MongoDB instance
 * that the NestJS app is using. Callers MUST close the client in afterAll.
 */
export async function getTestDb(): Promise<{ client: MongoClient; db: Db }> {
  const uri = getMongoUri();
  const client = new MongoClient(uri);
  await client.connect();

  // MongoMemoryServer URIs look like mongodb://127.0.0.1:PORT/
  // Mongoose typically uses the default db name from the URI or 'test'.
  const dbName = new URL(uri).pathname.slice(1) || 'test';
  return { client, db: client.db(dbName) };
}

/**
 * Deletes all documents from the specified collections.
 */
export async function cleanCollections(
  db: Db,
  collections: string[],
): Promise<void> {
  await Promise.all(collections.map((c) => db.collection(c).deleteMany({})));
}

/**
 * Asserts that a document matching `filter` exists in `collection`.
 * Returns the document if found; throws if not.
 */
export async function assertDocExists(
  db: Db,
  collection: string,
  filter: Record<string, unknown>,
): Promise<any> {
  const doc = await db.collection(collection).findOne(filter);
  if (!doc) {
    throw new Error(
      `Expected document in '${collection}' matching ${JSON.stringify(filter)} — not found`,
    );
  }
  return doc;
}

/**
 * Returns the count of documents matching `filter` in `collection`.
 */
export async function countDocs(
  db: Db,
  collection: string,
  filter: Record<string, unknown> = {},
): Promise<number> {
  return db.collection(collection).countDocuments(filter);
}
