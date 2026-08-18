'use strict';

const baseUrl = (process.env.STAGING_URL || process.env.LOADTEST_URL || '').replace(/\/$/, '');
const timeoutMs = Math.max(1000, Number(process.env.ACCEPTANCE_TIMEOUT_MS || 8000));
const requireReady = process.env.ACCEPTANCE_REQUIRE_READY !== 'false';

if (!baseUrl) {
  console.error('STAGING_URL is required. Refusing to run acceptance checks without an explicit staging target.');
  process.exit(2);
}

async function get(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, fn) {
  try {
    const result = await fn();
    const ok = result === true || result?.ok === true;
    console.log(`${ok ? '✓' : '✗'} ${name}${result?.detail ? ` — ${result.detail}` : ''}`);
    return ok;
  } catch (error) {
    console.error(`✗ ${name} — ${error.message}`);
    return false;
  }
}

(async () => {
  const results = [];
  results.push(await check('Liveness', async () => (await get('/api/health')).status === 200));
  results.push(await check('Readiness', async () => {
    const res = await get('/api/ready');
    if (!requireReady && res.status === 503) return { ok: true, detail: 'allowed by ACCEPTANCE_REQUIRE_READY=false' };
    return res.status === 200;
  }));
  results.push(await check('Frontend shell', async () => {
    const res = await get('/');
    const body = await res.text();
    return { ok: res.status === 200 && /<html/i.test(body), detail: `status=${res.status}` };
  }));
  results.push(await check('Public API config contains no private secrets', async () => {
    const res = await get('/api/config');
    const body = await res.text();
    return res.status === 200 && !/GEMINI|FIREBASE|ADMIN_FEEDBACK|DATABASE_URL/i.test(body);
  }));
  results.push(await check('Security headers present', async () => {
    const res = await get('/api/health');
    return {
      ok: !!res.headers.get('content-security-policy') && !!res.headers.get('x-content-type-options'),
      detail: `csp=${!!res.headers.get('content-security-policy')}`,
    };
  }));

  const load = process.env.RUN_LOAD_SMOKE === 'true';
  if (load) {
    const child = require('child_process').spawnSync(process.execPath, ['scripts/load-smoke.js'], {
      stdio: 'inherit',
      env: { ...process.env, LOADTEST_URL: baseUrl },
    });
    results.push(child.status === 0);
  }

  if (results.some(r => !r)) process.exit(1);
  console.log(`Staging acceptance passed for ${baseUrl}`);
})().catch(err => { console.error(err); process.exit(1); });
