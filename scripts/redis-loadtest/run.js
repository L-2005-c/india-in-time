// scripts/redis-loadtest/run.js
//
// Real distributed-load validation for the Redis-backed rate limiter.
// This is NOT a jest test with a mocked ioredis — it spawns several
// genuinely separate Node processes (worker-server.js), all pointed at one
// real Redis instance, and fires real concurrent HTTP requests at them
// simultaneously from the same client IP — exactly the scenario the
// original audit gap described: "multiple worker processes, real network
// latency, real concurrent traffic."
//
// What it proves: the shared Redis counter (INCR + PEXPIRE) stays correct
// under genuine cross-process race conditions — i.e. raising
// CLUSTER_WORKERS above 1 in production will not let more requests through
// than the configured limit, or incorrectly block fewer than it should.
//
// What it does NOT prove: behavior against a real hosted/managed Redis
// (e.g. Render's Redis add-on, Upstash) over real WAN latency, or under
// production-scale request volume. This runs against a local Redis
// instance over loopback. That gap can only be closed with the actual
// production Redis URL and real traffic — worth re-running this exact
// script pointed at a staging Redis before raising CLUSTER_WORKERS in
// production.
//
// Usage: node scripts/redis-loadtest/run.js
// Requires: a reachable Redis at REDIS_URL (defaults to redis://127.0.0.1:6379)

const { fork } = require('child_process');
const path = require('path');
const http = require('http');
const Redis = require('ioredis');

const REDIS_URL      = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const WORKER_COUNT    = 4;
const BASE_PORT        = 4101;
const RATE_LIMIT       = 50;     // requests allowed per window, for this run
const TOTAL_REQUESTS   = 300;    // fired concurrently, well over the limit, all in one Promise.all — true simultaneity

function log(msg) { console.log(`[redis-loadtest] ${msg}`); }

function startWorker(port) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker-server.js'), [String(port)], {
      env: {
        ...process.env,
        REDIS_URL,
        RATE_LIMIT_GENERAL: String(RATE_LIMIT),
        // Not used by this test (only the rate limiter route is hit) — set
        // so config.js's startup check doesn't print an unrelated warning.
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'loadtest-unused-dummy-key',
      },
      silent: true,
    });
    const timeout = setTimeout(() => reject(new Error(`worker on port ${port} did not become ready in time`)), 10000);
    child.stdout.on('data', (data) => {
      if (data.toString().includes('READY')) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', (data) => process.stderr.write(`[worker ${port}] ${data}`));
    child.on('error', reject);
  });
}

function requestOnce(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('ERROR'));
    req.on('timeout', () => { req.destroy(); resolve('TIMEOUT'); });
  });
}

function createRedisClient(url) {
  const isTls = String(url).startsWith('rediss://');
  return new Redis(url, {
    tls: isTls ? { rejectUnauthorized: process.env.NODE_ENV === 'production' } : undefined,
    maxRetriesPerRequest: 3,
    connectTimeout: 8000,
  });
}

async function main() {
  log(`Connecting to Redis at ${REDIS_URL} to clear stale test keys...`);
  const redis = createRedisClient(REDIS_URL);
  await redis.ping();
  const staleKeys = await redis.keys('rl:general:*');
  if (staleKeys.length) await redis.del(...staleKeys);
  await redis.quit();

  log(`Starting ${WORKER_COUNT} real worker processes (separate PIDs) sharing one Redis instance, limit=${RATE_LIMIT}/window...`);
  const workers = [];
  const ports = [];
  for (let i = 0; i < WORKER_COUNT; i++) {
    const port = BASE_PORT + i;
    ports.push(port);
    workers.push(await startWorker(port));
  }
  log(`All ${WORKER_COUNT} workers ready: PIDs ${workers.map(w => w.pid).join(', ')}`);

  log(`Firing ${TOTAL_REQUESTS} concurrent requests round-robin across all workers, from the same client IP...`);
  const start = Date.now();
  const calls = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const port = ports[i % ports.length];
    calls.push(requestOnce(port));
  }
  const results = await Promise.all(calls);
  const elapsedMs = Date.now() - start;

  const counts = results.reduce((acc, code) => {
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});

  log(`Done in ${elapsedMs}ms. Status code breakdown: ${JSON.stringify(counts)}`);

  for (const w of workers) w.send('shutdown');

  const allowed = counts[200] || 0;
  const limited = counts[429] || 0;
  const errored = TOTAL_REQUESTS - allowed - limited;

  let pass = true;
  if (allowed !== RATE_LIMIT) {
    log(`❌ FAIL: expected exactly ${RATE_LIMIT} requests to succeed (shared across ${WORKER_COUNT} processes), got ${allowed}. This would mean the cross-process counter is not atomic under real concurrency.`);
    pass = false;
  } else {
    log(`✅ Exactly ${RATE_LIMIT} requests succeeded across ${WORKER_COUNT} separate processes despite ${TOTAL_REQUESTS} concurrent requests — the shared Redis counter held under real cross-process race conditions.`);
  }
  if (errored > 0) {
    log(`⚠️  ${errored} requests errored/timed out (not counted as pass or fail, but worth investigating if non-zero repeatedly).`);
  }

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('[redis-loadtest] Fatal error:', err);
  process.exit(1);
});
