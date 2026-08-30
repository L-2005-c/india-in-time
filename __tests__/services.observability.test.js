'use strict';

const {
  recordHttpRequest,
  recordRouteCalculation,
  recordCacheOperation,
  getPrometheusMetricsText,
  resetMetrics,
} = require('../services/observability/prometheusMetrics');

describe('Services: Prometheus Observability Metrics Exporter (FAANG Grade)', () => {
  beforeEach(() => {
    resetMetrics();
  });

  test('records HTTP requests and latency histograms', () => {
    recordHttpRequest('GET', '/api/v1/routing/route?origin=17.65,83.26', 200, 0.045);
    recordHttpRequest('POST', '/api/v1/routing/matrix', 200, 0.12);
    recordHttpRequest('GET', '/api/places/12345', 404, 0.008);

    const metricsText = getPrometheusMetricsText();
    expect(metricsText).toContain('http_requests_total{method="GET",path="/api/v1/routing/route",status="200",status_group="2xx"} 1');
    expect(metricsText).toContain('http_requests_total{method="POST",path="/api/v1/routing/matrix",status="200",status_group="2xx"} 1');
    expect(metricsText).toContain('http_requests_total{method="GET",path="/api/places/:id",status="404",status_group="4xx"} 1');
    expect(metricsText).toContain('http_request_duration_seconds_bucket');
    expect(metricsText).toContain('http_request_duration_seconds_count');
  });

  test('records multi-tier routing operations', () => {
    recordRouteCalculation('osrm_racing', 'driving', true);
    recordRouteCalculation('google_routes', 'transit', true);
    recordRouteCalculation('corridor_model', 'driving', false);

    const metricsText = getPrometheusMetricsText();
    expect(metricsText).toContain('route_calculations_total{provider="osrm_racing",mode="driving",status="success"} 1');
    expect(metricsText).toContain('route_calculations_total{provider="google_routes",mode="transit",status="success"} 1');
    expect(metricsText).toContain('route_calculations_total{provider="corridor_model",mode="driving",status="failure"} 1');
  });

  test('records L1/L2 cache operations', () => {
    recordCacheOperation('l1_lru', 'get', true);
    recordCacheOperation('l1_lru', 'get', false);
    recordCacheOperation('l2_redis', 'get', true);

    const metricsText = getPrometheusMetricsText();
    expect(metricsText).toContain('cache_operations_total{tier="l1_lru",action="get",result="hit"} 1');
    expect(metricsText).toContain('cache_operations_total{tier="l1_lru",action="get",result="miss"} 1');
    expect(metricsText).toContain('cache_operations_total{tier="l2_redis",action="get",result="hit"} 1');
  });

  test('includes process memory and uptime gauges', () => {
    const metricsText = getPrometheusMetricsText();
    expect(metricsText).toContain('process_uptime_seconds');
    expect(metricsText).toContain('process_memory_bytes{type="heap_used"}');
  });
});
