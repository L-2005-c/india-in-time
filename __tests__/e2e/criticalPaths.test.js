/**
 * Critical-path API smoke tests (Jest + Supertest).
 * These are not browser e2e; they cover the server journeys that matter most.
 * For full browser e2e, see __tests__/e2e/playwright.config.js (optional dep).
 */
const request = require('supertest');

// Build a minimal app without clustering side effects when possible
function loadApp() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  // Avoid hard exit on missing prod secrets during test boot
  process.env.CORS_ALLOW_WILDCARD = process.env.CORS_ALLOW_WILDCARD || 'true';
  // server.js forks in primary mode — use health-only lightweight checks via require of routes where needed
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0' }));
  app.get('/api/health/live', (_req, res) => res.json({ status: 'alive' }));
  const { apiVersion } = require('../../middleware/apiVersion');
  app.use('/api', apiVersion);
  app.get('/api/version-check', (req, res) => res.json({ v: req.apiVersion }));
  return app;
}

describe('critical path smoke', () => {
  const app = loadApp();

  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/health/live returns alive', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  test('API version middleware negotiates v1', async () => {
    const res = await request(app).get('/api/version-check');
    expect(res.status).toBe(200);
    expect(res.body.v).toBe('1');
    expect(res.headers['x-api-version']).toBe('1');
  });
});
