'use strict';

const request = require('supertest');
const express = require('express');
const routingRoutes = require('../routes/routing');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/routing', routingRoutes);
  return app;
}

describe('API Route /api/v1/routing/route', () => {
  const app = createApp();

  test('returns 400 when origin or destination is missing', async () => {
    const res = await request(app).get('/api/v1/routing/route?origin=17.68,83.21');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('MISSING_COORDINATES');
  });

  test('returns 200 with canonical schema for valid coordinates', async () => {
    const res = await request(app).get('/api/v1/routing/route?origin=17.7126,83.3235&destination=17.7816,83.3852&mode=driving');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.distance).toBeDefined();
    expect(res.body.distance.kilometers).toBeGreaterThan(0);
    expect(res.body.duration).toBeDefined();
    expect(res.body.duration.trafficAwareMinutes).toBeGreaterThan(0);
    expect(res.body.traffic).toBeDefined();
    expect(res.body.traffic.status).toBeDefined();
    expect(res.body.timestamps.projectedArrival).toBeDefined();
    expect(res.body.route.googleMapsUrl).toContain('maps/dir');
  });

  test('returns 200 for walking mode', async () => {
    const res = await request(app).get('/api/v1/routing/route?origin=17.7126,83.3235&destination=17.7200,83.3300&mode=walking');
    expect(res.status).toBe(200);
    expect(res.body.travelMode).toBe('walking');
    expect(res.body.distance.meters).toBeGreaterThan(0);
  });
});

describe('API Route /api/v1/routing/matrix', () => {
  const app = createApp();

  test('returns 400 for invalid stops array', async () => {
    const res = await request(app).post('/api/v1/routing/matrix').send({ stops: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STOPS_ARRAY');
  });

  test('returns 200 with matrix legs and cumulative totals', async () => {
    const stops = [
      { coords: [17.7126, 83.3235], name: 'RK Beach' },
      { coords: [17.7492, 83.3424], name: 'Kailasagiri' },
    ];
    const res = await request(app).post('/api/v1/routing/matrix').send({ stops, mode: 'driving' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.legs.length).toBe(1);
    expect(res.body.totals.distance.kilometers).toBeGreaterThan(0);
  });
});

describe('API Route /api/v1/routing/eta', () => {
  const app = createApp();

  test('returns lightweight ETA', async () => {
    const res = await request(app).get('/api/v1/routing/eta?origin=17.7126,83.3235&destination=17.7492,83.3424');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.distance).toBeDefined();
    expect(res.body.duration).toBeDefined();
    expect(res.body.traffic).toBeDefined();
  });
});
