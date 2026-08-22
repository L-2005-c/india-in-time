// scripts/redis-loadtest/cache-check.js
//
// Validates services/cache.js's Redis write-through + cross-process warm
// behavior against a real Redis instance — no mocked ioredis. Simulates two
// separate processes (two separate LRUCache instances with two separate
// real ioredis connections, exactly as two real worker processes would
// have): process A writes a value; process B, which has never seen that
// key locally, reads it and should get a background warm from Redis on its
// *second* read (the first read is still a synchronous local miss by
// design — see the comment in cache.js's get()).
//
// Usage: node scripts/redis-loadtest/cache-check.js

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'loadtest-unused-dummy-key';

const Redis = require('ioredis');
const { LRUCache } = require('../../services/cache');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function log(msg) { console.log(`[cache-check] ${msg}`); }
function createRedisClient(url) {
  const isTls = String(url).startsWith('rediss://');
  return new Redis(url, {
    tls: isTls ? { rejectUnauthorized: process.env.NODE_ENV === 'production' } : undefined,
    maxRetriesPerRequest: 3,
    connectTimeout: 8000,
  });
}

async function pollUntil(fn, timeoutMs = 5000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (_e) {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function main() {
  log(`Connecting to Redis at ${REDIS_URL}...`);
  const redisA = createRedisClient(REDIS_URL);
  const redisB = createRedisClient(REDIS_URL);
  await redisA.ping();

  // Clear any stale key from a previous run
  await redisA.del('cache:loadtest:shared-key');

  const cacheA = new LRUCache({ name: 'loadtest', redis: redisA });
  const cacheB = new LRUCache({ name: 'loadtest', redis: redisB }); // simulates a second process

  log('Process A writes a value...');
  cacheA.set('shared-key', { hello: 'world' }, 30000);

  // set() writes through to Redis fire-and-forget — poll until landed (resilient to network/WAN latency)
  const rawFromRedis = await pollUntil(async () => await redisA.get('cache:loadtest:shared-key'), 4000);
  if (!rawFromRedis) {
    log('❌ FAIL: value never landed in real Redis after set() — write-through is broken.');
    process.exit(1);
  }
  log(`✅ Write-through confirmed: real GET from Redis returned ${rawFromRedis}`);

  log('Process B (separate LRUCache + separate Redis connection) reads the key for the first time...');
  const firstRead = cacheB.get('shared-key');
  if (firstRead !== undefined) {
    log('❌ FAIL: expected the first read on a fresh process to be a synchronous local miss (undefined) per the documented contract.');
    process.exit(1);
  }
  log('✅ First read on process B was a local miss, as documented (warm kicked off in the background).');

  // Poll until background warm completes into memory
  const secondRead = await pollUntil(() => {
    const r = cacheB.get('shared-key');
    return r && r.hello === 'world' ? r : null;
  }, 4000);

  if (!secondRead || secondRead.hello !== 'world') {
    log(`❌ FAIL: expected the warmed value {hello: 'world'}, got ${JSON.stringify(secondRead)}`);
    process.exit(1);
  }
  log(`✅ Process B's second read got the value written by process A via real Redis: ${JSON.stringify(secondRead)}`);

  await redisA.del('cache:loadtest:shared-key');
  await redisA.quit();
  await redisB.quit();
  log('✅ All cache cross-process checks passed against real Redis.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[cache-check] Fatal error:', err);
  process.exit(1);
});
