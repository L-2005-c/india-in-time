// Dependency-free staging load smoke test. This is deliberately a smoke test,
// not a capacity certification; real production capacity must be measured with
// realistic authenticated traffic and provider quotas.
'use strict';
const baseUrl = (process.env.LOADTEST_URL || '').replace(/\/$/, '') || 'http://127.0.0.1:3000';
const durationMs = Math.max(1000, Number(process.env.LOADTEST_DURATION_SEC || 30) * 1000);
const concurrency = Math.max(1, Math.min(250, Number(process.env.LOADTEST_CONCURRENCY || 20)));
const timeoutMs = Math.max(1000, Number(process.env.LOADTEST_TIMEOUT_MS || 5000));
const routes = ['/api/health', '/api/health/live', '/api/config', '/'];

async function hit(path) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    return { ok: res.status >= 200 && res.status < 500, status: res.status, latency: Date.now() - started, path };
  } catch (error) {
    return { ok: false, status: 0, latency: Date.now() - started, path, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const endAt = Date.now() + durationMs;
  const rows = [];
  async function worker(id) {
    let i = id;
    while (Date.now() < endAt) {
      rows.push(await hit(routes[i % routes.length]));
      i += concurrency;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  const failures = rows.filter(r => !r.ok);
  const successful = rows.filter(r => r.ok);
  const latencies = successful.map(r => r.latency).sort((a, b) => a - b);
  const q = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : null;
  const errorRate = rows.length ? failures.length / rows.length : 1;
  const report = {
    url: baseUrl,
    durationSec: durationMs / 1000,
    concurrency,
    requests: rows.length,
    successes: successful.length,
    failures: failures.length,
    errorRate,
    p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99),
    routeFailures: failures.slice(0, 10),
  };
  console.log(JSON.stringify(report, null, 2));
  const maxErrorRate = Number(process.env.LOADTEST_MAX_ERROR_RATE || 0.01);
  const maxP95 = Number(process.env.LOADTEST_MAX_P95_MS || 1000);
  if (!rows.length || errorRate > maxErrorRate || (report.p95Ms != null && report.p95Ms > maxP95)) process.exit(1);
}
main().catch(err => { console.error(err); process.exit(1); });
