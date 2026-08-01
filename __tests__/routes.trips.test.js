// __tests__/routes.trips.test.js
// routes/trips.js previously had 0% test coverage despite containing the
// ownership-scoping logic that stops one user from reading/deleting another
// user's saved trip. Mounts the real router through Express (via supertest)
// with requireAuth and db/queries mocked, so this exercises the actual
// route wiring, not just the underlying query functions in isolation.

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.uid = req.headers['x-test-uid'] || 'user-1';
    next();
  },
}));

jest.mock('../db/queries', () => ({
  saveTrip: jest.fn(),
  getUserTrips: jest.fn(),
  getTripById: jest.fn(),
  getTripByShareToken: jest.fn(),
  updateTripShareToken: jest.fn(),
  deleteTrip: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const tripsRouter = require('../routes/trips');
const queries = require('../db/queries');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/trips', tripsRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('POST /api/trips', () => {
  test('rejects a request missing required fields', async () => {
    const res = await request(app).post('/api/trips').send({ city: 'Jaipur' });
    expect(res.status).toBe(400);
    expect(queries.saveTrip).not.toHaveBeenCalled();
  });

  test('saves the trip under the authenticated uid, never a client-supplied userId', async () => {
    queries.saveTrip.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/trips')
      .set('x-test-uid', 'real-user')
      .send({ city: 'Jaipur', stops: [{ name: 'Hawa Mahal' }], userId: 'attacker-supplied-id' });

    expect(res.status).toBe(201);
    const savedArgs = queries.saveTrip.mock.calls[0][0];
    expect(savedArgs.userId).toBe('real-user');
    expect(savedArgs.city).toBe('Jaipur');
    expect(JSON.parse(savedArgs.stopsJson)).toEqual([{ name: 'Hawa Mahal' }]);
  });
});

describe('GET /api/trips/:id — ownership scoping', () => {
  test('returns 404 (not 403) when the trip exists but belongs to someone else', async () => {
    queries.getTripById.mockResolvedValue({ id: 't1', user_id: 'someone-else', city: 'Goa' });
    const res = await request(app).get('/api/trips/t1').set('x-test-uid', 'me');
    expect(res.status).toBe(404); // deliberately not 403 — avoids confirming the id exists at all
  });

  test('returns 404 when the trip does not exist', async () => {
    queries.getTripById.mockResolvedValue(null);
    const res = await request(app).get('/api/trips/missing').set('x-test-uid', 'me');
    expect(res.status).toBe(404);
  });

  test('returns the trip when the requester is the owner', async () => {
    queries.getTripById.mockResolvedValue({
      id: 't1', user_id: 'me', city: 'Goa', city_lat: 15.3, city_lon: 74.1,
      config_json: '{"days":2}', stops_json: '[{"name":"Baga Beach"}]',
      status: 'saved', share_token: null, created_at: '2026-01-01',
    });
    const res = await request(app).get('/api/trips/t1').set('x-test-uid', 'me');
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Goa');
    expect(res.body.stops).toEqual([{ name: 'Baga Beach' }]);
  });
});

describe('DELETE /api/trips/:id — ownership scoping', () => {
  test('always calls deleteTrip scoped to the authenticated uid, not any client-supplied id', async () => {
    queries.deleteTrip.mockResolvedValue(undefined);
    await request(app).delete('/api/trips/t1').set('x-test-uid', 'me');
    expect(queries.deleteTrip).toHaveBeenCalledWith('t1', 'me');
  });
});

describe('GET /api/trips/shared/:token — intentionally public', () => {
  test('does not require auth and does not echo the share_token or user_id back', async () => {
    queries.getTripByShareToken.mockResolvedValue({
      id: 't1', city: 'Udaipur', city_lat: 24.5, city_lon: 73.6,
      config_json: '{}', stops_json: '[]', created_at: '2026-01-01',
      share_token: 'secret-token-value', user_id: 'owner-uid',
    });
    const res = await request(app).get('/api/trips/shared/secret-token-value');
    expect(res.status).toBe(200);
    expect(res.body.share_token).toBeUndefined();
    expect(res.body.user_id).toBeUndefined();
    expect(res.body.city).toBe('Udaipur');
  });

  test('returns 404 for an unknown share token', async () => {
    queries.getTripByShareToken.mockResolvedValue(null);
    const res = await request(app).get('/api/trips/shared/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/trips/:id/share', () => {
  test('refuses to generate a share link for a trip you do not own', async () => {
    queries.getTripById.mockResolvedValue({ id: 't1', user_id: 'someone-else' });
    const res = await request(app).post('/api/trips/t1/share').set('x-test-uid', 'me');
    expect(res.status).toBe(404);
    expect(queries.updateTripShareToken).not.toHaveBeenCalled();
  });

  test('returns the existing share token instead of generating a new one if one already exists', async () => {
    queries.getTripById.mockResolvedValue({ id: 't1', user_id: 'me', share_token: 'existing-token' });
    const res = await request(app).post('/api/trips/t1/share').set('x-test-uid', 'me');
    expect(res.status).toBe(200);
    expect(res.body.shareToken).toBe('existing-token');
    expect(queries.updateTripShareToken).not.toHaveBeenCalled();
  });

  test('generates and persists a new token when the trip has none yet', async () => {
    queries.getTripById.mockResolvedValue({ id: 't1', user_id: 'me', share_token: null });
    queries.updateTripShareToken.mockResolvedValue(undefined);
    const res = await request(app).post('/api/trips/t1/share').set('x-test-uid', 'me');
    expect(res.status).toBe(200);
    expect(res.body.shareToken).toEqual(expect.any(String));
    expect(res.body.shareToken.length).toBeGreaterThan(0);
    expect(queries.updateTripShareToken).toHaveBeenCalledWith('t1', res.body.shareToken);
  });
});
