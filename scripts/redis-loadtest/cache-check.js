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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const redisA = new Redis(REDIS_URL);
  const redisB = new Redis(REDIS_URL);
  await redisA.ping();

  // Clear any stale key from a previous run
  await redisA.del('cache:loadtest:shared-key');

  const cacheA = new LRUCache({ name: 'loadtest', redis: redisA });
  const cacheB = new LRUCache({ name: 'loadtest', redis: redisB }); // simulates a second process

  log('Process A writes a value...');
  cacheA.set('shared-key', { hello: 'world' }, 30000);

  // set() writes through to Redis fire-and-forget — give it a moment to land
  await sleep(300);

  const rawFromRedis = await redisA.get('cache:loadtest:shared-key');
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

  // Give the background warm a moment to complete
  await sleep(300);

  log('Process B reads the key again — should now be warmed from Redis...');
  const secondRead = cacheB.get('shared-key');
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
