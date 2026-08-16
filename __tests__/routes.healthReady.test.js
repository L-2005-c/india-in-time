// __tests__/routes.healthReady.test.js — Regression test for gating
// /api/health/ready behind admin auth. Previously this endpoint was fully
// public and returned internal state (heap usage, Gemini circuit-breaker
// state, cache stats) to any caller — not a secret-leaking issue, but a
// real "why is this internal diagnostic surface wide open" finding. This
// mounts the exact same route wiring server.js uses (minus DB/clustering
// concerns, which aren't relevant here) to verify the gate actually works,
// end to end through Express, rather than only unit-testing requireAdminAuth
// in isolation.

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
const { requireAdminAuth } = require('../middleware/adminAuth');

function buildTestApp() {
  const app = express();
  app.get('/api/health/ready', requireAdminAuth, (_req, res) => {
    res.json({ status: 'ready', caches: { places: { size: 3 } } });
  });
  return app;
}

describe('GET /api/health/ready — admin-gated', () => {
  let app;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(() => { delete process.env.FIREBASE_SERVICE_ACCOUNT; });

  test('rejects unauthenticated requests (regression: this used to be fully public)', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(401);
    expect(res.body.caches).toBeUndefined();
  });

  test('rejects an incorrect admin key', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    const res = await request(app).get('/api/health/ready').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });

  test('allows access with the correct admin key and returns internal state', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    const res = await request(app).get('/api/health/ready').set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.caches.places.size).toBe(3);
  });

  test('returns 503 (not a silent 200) if admin auth is completely unconfigured', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
  });
});
