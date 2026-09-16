// __tests__/routes.adminMe.test.js — Tests for /api/admin/me session verification endpoint

jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(async (token) => {
    if (token === 'admin-claim-token') {
      return {
        uid: 'claim-admin-uid',
        email: 'claim-admin@example.com',
        admin: true,
        role: 'owner',
      };
    }
    if (token === 'whitelist-token') {
      return {
        uid: 'whitelist-uid',
        email: 'whitelisted@example.com',
        admin: false,
      };
    }
    if (token === 'unauthorized-token') {
      return {
        uid: 'normal-user-uid',
        email: 'normal@example.com',
        admin: false,
      };
    }
    throw new Error('Firebase ID token has invalid signature');
  }),
}));

const express = require('express');
const request = require('supertest');
const { requireAdminRole } = require('../middleware/adminAuth');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/admin/me', requireAdminRole('owner', 'admin', 'analytics'), (req, res) => {
    res.json({
      ok: true,
      uid: req.uid,
      email: req.adminEmail,
      role: req.adminRole,
      authMethod: req.adminAuthMethod,
    });
  });
  return app;
}

describe('GET /api/admin/me — admin session verification', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    process.env.ADMIN_EMAILS = 'whitelisted@example.com';
  });

  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.ADMIN_EMAILS;
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/me');
    expect(res.status).toBe(401);
  });

  test('accepts claim-based admin and returns role owner', async () => {
    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', 'Bearer admin-claim-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      uid: 'claim-admin-uid',
      email: 'claim-admin@example.com',
      role: 'owner',
      authMethod: 'firebase-claim',
    });
  });

  test('accepts whitelisted admin and returns role analytics', async () => {
    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', 'Bearer whitelist-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      uid: 'whitelist-uid',
      email: 'whitelisted@example.com',
      role: 'analytics',
      authMethod: 'admin-whitelist',
    });
  });

  test('rejects non-admin users with 401', async () => {
    const res = await request(app)
      .get('/api/admin/me')
      .set('Authorization', 'Bearer unauthorized-token');
    expect(res.status).toBe(401);
  });
});
