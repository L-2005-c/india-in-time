'use strict';
const { recordRequest, getSloReport } = require('../lib/slo');
describe('slo', () => {
  test('report shape', () => {
    recordRequest({ ok: true, ms: 50, route: '/api/health' });
    recordRequest({ ok: true, ms: 100, route: '/api/health' });
    recordRequest({ ok: false, ms: 500, route: '/api/ai/chat' });
    const r = getSloReport();
    expect(r).toHaveProperty('availability');
    expect(r).toHaveProperty('latency');
    expect(r.sampleCount).toBeGreaterThanOrEqual(3);
  });
});
