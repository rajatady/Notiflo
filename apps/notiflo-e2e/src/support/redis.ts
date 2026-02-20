import Redis from 'ioredis';

/**
 * Creates a fresh ioredis client connected to the test Redis instance.
 * Callers MUST call redis.quit() in afterAll/afterEach.
 */
export function getTestRedis(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new Redis(url);
}

/**
 * Probes Redis availability by attempting a PING.
 * Returns true if Redis is reachable, false otherwise.
 */
export async function checkRedisAvailable(): Promise<boolean> {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 3000,
    });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch {
    return false;
  }
}

/**
 * Polls a Redis stream until an entry matching `filter` appears,
 * or throws after `timeoutMs`.
 */
export async function waitForStreamEntry(
  redis: Redis,
  streamKey: string,
  filter: Record<string, string>,
  timeoutMs = 5000,
): Promise<Record<string, string>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = await redis.xrange(streamKey, '-', '+');
    for (const [, fields] of entries) {
      const map = parseStreamFields(fields);
      const matches = Object.entries(filter).every(
        ([k, v]) => map[k] === v,
      );
      if (matches) return map;
    }
    await sleep(100);
  }
  throw new Error(
    `No stream entry matching ${JSON.stringify(filter)} in '${streamKey}' within ${timeoutMs}ms`,
  );
}

/**
 * Converts the flat [key, val, key, val, ...] array returned by
 * XRANGE/XREADGROUP into a key-value object.
 */
export function parseStreamFields(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }
  return map;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
