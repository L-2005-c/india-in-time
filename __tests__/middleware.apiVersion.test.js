const express = require('express');
const request = require('supertest');
const { apiVersion } = require('../middleware/apiVersion');

function buildApp() {
  const app = express();
  app.use(apiVersion);
  app.get('/api/ping', (req, res) => res.json({ version: req.apiVersion }));
  return app;
}

describe('apiVersion middleware', () => {
  const app = buildApp();

  test('defaults to version 1', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1');
    expect(res.headers['x-api-version']).toBe('1');
  });

  test('accepts X-API-Version header', async () => {
    const res = await request(app).get('/api/ping').set('X-API-Version', '1');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1');
  });

  test('accepts ?api_version=1', async () => {
    const res = await request(app).get('/api/ping?api_version=1');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1');
  });

  test('rejects unsupported version', async () => {
    const res = await request(app).get('/api/ping').set('X-API-Version', '99');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_API_VERSION');
  });
});
