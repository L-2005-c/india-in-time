// scripts/redis-loadtest/fail-open-check.js
//
// Validates the documented "fails open" behavior of the real
// middleware/rateLimiter.js against a genuinely unreachable Redis — not a
// mocked error, an actual connection refused. Starts one real worker-server
// process pointed at a closed port, fires real requests at it, and confirms
// they're still served (200, not hung or 5xx) rather than the whole API
// going down because Redis is unavailable.
//
// Usage: node scripts/redis-loadtest/fail-open-check.js

const { fork } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 4201;
const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1'; // port 1: connection refused, fast

function log(msg) { console.log(`[fail-open-check] ${msg}`); }

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

async function main() {
  log(`Starting one worker pointed at an unreachable Redis (${UNREACHABLE_REDIS_URL})...`);
  const child = fork(path.join(__dirname, 'worker-server.js'), [String(PORT)], {
    env: {
      ...process.env,
      REDIS_URL: UNREACHABLE_REDIS_URL,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'loadtest-unused-dummy-key',
    },
    silent: true,
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker did not become ready in time')), 10000);
    child.stdout.on('data', (data) => {
      if (data.toString().includes('READY')) { clearTimeout(timeout); resolve(); }
    });
    child.on('error', reject);
  });

  log('Worker ready. Firing 10 requests against it while Redis is unreachable...');
  const results = await Promise.all(Array.from({ length: 10 }, () => requestOnce(PORT)));
  log(`Results: ${JSON.stringify(results)}`);

  child.send('shutdown');

  const allServed = results.every((code) => code === 200);
  if (allServed) {
    log('✅ All 10 requests were served (200) despite Redis being completely unreachable — fail-open behavior confirmed against a real connection failure, not a mock.');
  } else {
    log('❌ FAIL: at least one request was not served while Redis was unreachable — the "fails open" claim does not hold under a real connection failure.');
  }
  process.exit(allServed ? 0 : 1);
}

main().catch((err) => {
  console.error('[fail-open-check] Fatal error:', err);
  process.exit(1);
});
