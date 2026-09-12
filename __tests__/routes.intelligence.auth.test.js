'use strict';

/**
 * __tests__/routes.intelligence.auth.test.js
 *
 * Verifies tenant isolation and strict trip ownership access control:
 * User A's journey state, plan versions, progress, and replanning
 * cannot be accessed or mutated by User B or unauthenticated callers.
 */

jest.mock('../db/queries', () => ({
  getTripById: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const queries = require('../db/queries');

function buildApp() {
  const app = express();
  app.use(express.json());

  // Mock optionalAuth extraction
  app.use((req, _res, next) => {
    if (req.headers['x-test-uid']) {
      req.uid = req.headers['x-test-uid'];
    }
    next();
  });

  const intelligenceRouter = require('../routes/intelligence');
  app.use('/api/intelligence', intelligenceRouter);
  return app;
}

describe('Intelligence Trip Ownership & Tenant Isolation', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    queries.getTripById.mockResolvedValue(null);
    app = buildApp();
  });

  test('User A initializes trip state, User A can read it', async () => {
    const tripId = 'trip_owner_a';
    const stops = [
      { id: 's1', name: 'Stop 1', lat: 17.68, lon: 83.21, plannedDurationMinutes: 45 },
    ];

    // User A initializes journey state
    const initRes = await request(app)
      .post(`/api/intelligence/trips/${tripId}/state`)
      .set('x-test-uid', 'user_A')
      .send({ plan: { stops }, travelerId: 'user_A' });

    expect(initRes.status).toBe(200);

    // User A reads journey state
    const readRes = await request(app)
      .get(`/api/intelligence/trips/${tripId}/state`)
      .set('x-test-uid', 'user_A');

    expect(readRes.status).toBe(200);
    expect(readRes.body.tripId).toBe(tripId);
  });

  test('User B is blocked with 403 when attempting to read User A journey state', async () => {
    const tripId = 'trip_owner_a';

    const res = await request(app)
      .get(`/api/intelligence/trips/${tripId}/state`)
      .set('x-test-uid', 'user_B');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('User B is blocked with 403 when attempting to advance progress on User A trip', async () => {
    const tripId = 'trip_owner_a';

    const res = await request(app)
      .post(`/api/intelligence/trips/${tripId}/state/progress`)
      .set('x-test-uid', 'user_B')
      .send({ stopId: 's1', action: 'COMPLETE' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('User B is blocked with 403 when attempting to replan User A journey', async () => {
    const tripId = 'trip_owner_a';

    const res = await request(app)
      .post(`/api/intelligence/trips/${tripId}/replan`)
      .set('x-test-uid', 'user_B')
      .send({ triggerType: 'WEATHER_RAIN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Unauthenticated caller is blocked with 401 when accessing User A saved journey', async () => {
    const tripId = 'trip_owner_a';

    const res = await request(app)
      .get(`/api/intelligence/trips/${tripId}/state`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/i);
  });

  test('Trip saved in DB under User A blocks User B even if in-memory cache was cold', async () => {
    const coldTripId = 'cold_trip_in_db';
    queries.getTripById.mockResolvedValue({
      id: coldTripId,
      user_id: 'user_A',
      city: 'Visakhapatnam',
    });

    const res = await request(app)
      .get(`/api/intelligence/trips/${coldTripId}/state`)
      .set('x-test-uid', 'user_B');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Guest trip with no owner allows access for anonymous travelers', async () => {
    const guestTripId = 'guest_trip_123';
    const stops = [
      { id: 'g1', name: 'Guest Stop', lat: 17.68, lon: 83.21, plannedDurationMinutes: 30 },
    ];

    const initRes = await request(app)
      .post(`/api/intelligence/trips/${guestTripId}/state`)
      .send({ plan: { stops }, travelerId: 'anonymous_guest' });

    expect(initRes.status).toBe(200);

    const readRes = await request(app)
      .get(`/api/intelligence/trips/${guestTripId}/state`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.tripId).toBe(guestTripId);
  });
});
