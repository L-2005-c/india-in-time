// __tests__/routes.analytics.test.js
// routes/analytics.js previously had 0% test coverage. Covers the
// admin-gating on /summary (this endpoint used to be fully public and leak
// server memory/Node version/cache internals — see the route's own comment)
// and the request-logging middleware's self-exclusion (it must not log
// requests to /api/analytics itself, or it would log-loop).

jest.mock('../db/queries', () => ({
  getApiUsageSummary: jest.fn(),
  logApiUsage: jest.fn(),
}));
jest.mock('../services/cache', () => {
  const fakeStats = { size: 3, hits: 10, misses: 2 };
  return {
    placesCache:  { getStats: jest.fn(() => fakeStats) },
    geminiCache:  { getStats: jest.fn(() => fakeStats) },
    weatherCache: { getStats: jest.fn(() => fakeStats) },
    geocodeCache: { getStats: jest.fn(() => fakeStats) },
  };
});
jest.mock('../services/gemini', () => ({
  getStats: jest.fn(() => ({ total: 5, success: 4, circuitState: 'CLOSED' })),
}));

jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(async () => ({
    uid: 'admin-uid',
    email: 'admin@example.com',
    admin: true,
    role: 'admin',
  })),
}));

const express = require('express');
const request = require('supertest');
const { router: analyticsRouter, analyticsMiddleware } = require('../routes/analytics');
const { getApiUsageSummary, logApiUsage } = require('../db/queries');

function buildApp() {
  const app = express();
  app.use(analyticsMiddleware);
  app.get('/api/places', (_req, res) => res.json({ ok: true })); // a dummy tracked route
  app.use('/api/analytics', analyticsRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
  getApiUsageSummary.mockResolvedValue({ totalRequests: 42 });
  app = buildApp();
});
afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

describe('GET /api/analytics/summary — admin-gated', () => {

  test('rejects an unauthenticated request (regression: this endpoint used to be fully public)', async () => {
        const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(401);
    expect(res.body.server).toBeUndefined();
  });

  test('returns server/cache/gemini/usage stats with a valid admin key', async () => {
        const res = await request(app).get('/api/analytics/summary').set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.apiUsage).toEqual({ totalRequests: 42 });
    expect(res.body.caches.places).toEqual({ size: 3, hits: 10, misses: 2 });
    expect(res.body.gemini.circuitState).toBe('CLOSED');
    expect(res.body.server.nodeVersion).toBe(process.version);
  });

  test('caps the ?hours= param at 168 (7 days) even if a larger value is requested', async () => {
        await request(app).get('/api/analytics/summary?hours=99999').set('Authorization', 'Bearer test-admin-token');
    expect(getApiUsageSummary).toHaveBeenCalledWith(168);
  });

  test('defaults to 24 hours when ?hours= is not provided', async () => {
        await request(app).get('/api/analytics/summary').set('Authorization', 'Bearer test-admin-token');
    expect(getApiUsageSummary).toHaveBeenCalledWith(24);
  });
});

describe('analyticsMiddleware', () => {
  test('logs a request to a normal /api/ route after it finishes', async () => {
    await request(app).get('/api/places');
    // res.on('finish', ...) fires async after the response is sent — give
    // the event loop a tick before asserting.
    await new Promise(r => setImmediate(r));
    expect(logApiUsage).toHaveBeenCalledTimes(1);
    expect(logApiUsage.mock.calls[0][0].endpoint).toBe('/api/places');
  });

  test('does NOT log requests to /api/analytics itself (would otherwise log-loop)', async () => {
        await request(app).get('/api/analytics/summary').set('Authorization', 'Bearer test-admin-token');
    await new Promise(r => setImmediate(r));
    expect(logApiUsage).not.toHaveBeenCalled();
  });
});
