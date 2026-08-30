'use strict';

/**
 * Enterprise Prometheus & Observability Metrics Engine
 * Tracks:
 * - http_requests_total{method, path, status}
 * - http_request_duration_seconds{method, path, status, quantile}
 * - route_calculations_total{provider, mode, status}
 * - route_duration_ms{provider, mode}
 * - cache_operations_total{tier, action, result}
 * - active_itineraries_gauge
 */

const httpRequestsTotal = new Map();
const httpDurationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const httpDurations = new Map();
const routingRequestsTotal = new Map();
const cacheOpsTotal = new Map();

function incCounter(map, key, val = 1) {
  map.set(key, (map.get(key) || 0) + val);
}

function observeDuration(map, key, seconds) {
  if (!map.has(key)) {
    map.set(key, { count: 0, sum: 0, buckets: httpDurationBuckets.map(() => 0) });
  }
  const metric = map.get(key);
  metric.count += 1;
  metric.sum += seconds;
  for (let i = 0; i < httpDurationBuckets.length; i++) {
    if (seconds <= httpDurationBuckets[i]) {
      metric.buckets[i] += 1;
    }
  }
}

function recordHttpRequest(method, path, statusCode, durationSec) {
  const normalizedPath = String(path || '/')
    .replace(/\/[0-9a-fA-F-]{8,}/g, '/:id')
    .replace(/\/\d+/g, '/:id')
    .split('?')[0] || '/';

  const statusGroup = `${Math.floor(statusCode / 100)}xx`;
  const key = `method="${method}",path="${normalizedPath}",status="${statusCode}",status_group="${statusGroup}"`;
  incCounter(httpRequestsTotal, key);
  observeDuration(httpDurations, `method="${method}",path="${normalizedPath}"`, durationSec);
}

function recordRouteCalculation(provider, mode, isSuccess) {
  const status = isSuccess ? 'success' : 'failure';
  const key = `provider="${provider || 'unknown'}",mode="${mode || 'driving'}",status="${status}"`;
  incCounter(routingRequestsTotal, key);
}

function recordCacheOperation(tier, action, isHit) {
  const result = isHit ? 'hit' : 'miss';
  const key = `tier="${tier || 'l1'}",action="${action || 'get'}",result="${result}"`;
  incCounter(cacheOpsTotal, key);
}

function getPrometheusMetricsText() {
  const lines = [
    '# HELP http_requests_total Total number of HTTP requests processed',
    '# TYPE http_requests_total counter',
  ];

  for (const [labels, val] of httpRequestsTotal.entries()) {
    lines.push(`http_requests_total{${labels}} ${val}`);
  }

  lines.push('');
  lines.push('# HELP http_request_duration_seconds HTTP request latency distributions');
  lines.push('# TYPE http_request_duration_seconds histogram');

  for (const [labels, metric] of httpDurations.entries()) {
    let cum = 0;
    for (let i = 0; i < httpDurationBuckets.length; i++) {
      cum += metric.buckets[i];
      lines.push(`http_request_duration_seconds_bucket{${labels},le="${httpDurationBuckets[i]}"} ${cum}`);
    }
    lines.push(`http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`);
    lines.push(`http_request_duration_seconds_sum{${labels}} ${metric.sum.toFixed(4)}`);
    lines.push(`http_request_duration_seconds_count{${labels}} ${metric.count}`);
  }

  lines.push('');
  lines.push('# HELP route_calculations_total Total number of multi-tier routing operations');
  lines.push('# TYPE route_calculations_total counter');
  for (const [labels, val] of routingRequestsTotal.entries()) {
    lines.push(`route_calculations_total{${labels}} ${val}`);
  }

  lines.push('');
  lines.push('# HELP cache_operations_total Cache hit and miss operations across L1 LRU and L2 Redis');
  lines.push('# TYPE cache_operations_total counter');
  for (const [labels, val] of cacheOpsTotal.entries()) {
    lines.push(`cache_operations_total{${labels}} ${val}`);
  }

  lines.push('');
  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

  lines.push('');
  lines.push('# HELP process_memory_bytes Memory usage breakdown in bytes');
  lines.push('# TYPE process_memory_bytes gauge');
  const mem = process.memoryUsage();
  lines.push(`process_memory_bytes{type="heap_used"} ${mem.heapUsed}`);
  lines.push(`process_memory_bytes{type="heap_total"} ${mem.heapTotal}`);
  lines.push(`process_memory_bytes{type="rss"} ${mem.rss}`);

  return lines.join('\n') + '\n';
}

function resetMetrics() {
  httpRequestsTotal.clear();
  httpDurations.clear();
  routingRequestsTotal.clear();
  cacheOpsTotal.clear();
}

module.exports = {
  recordHttpRequest,
  recordRouteCalculation,
  recordCacheOperation,
  getPrometheusMetricsText,
  resetMetrics,
};
