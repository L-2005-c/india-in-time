// __tests__/routes.geocode.test.js
// routes/geocode.js previously had 0% test coverage. Also covers the Photon
// fallback added to fix the single-point-of-failure gap this endpoint used
// to have — a Nominatim outage used to mean city search was fully broken.

jest.mock('node-fetch');
jest.mock('../services/cache', () => ({
  geocodeCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const fetch = require('node-fetch');
const express = require('express');
const request = require('supertest');
const geocodeRouter = require('../routes/geocode');
const { geocodeCache } = require('../services/cache');

function buildApp() {
  const app = express();
  app.use('/api/geocode', geocodeRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  geocodeCache.get.mockReturnValue(null);
  app = buildApp();
});

describe('GET /api/geocode', () => {
  test('rejects a missing ?q= param', async () => {
    const res = await request(app).get('/api/geocode');
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('serves from cache without calling Nominatim when a cache entry exists', async () => {
    geocodeCache.get.mockReturnValue([{ lat: '15.3', lon: '74.1', display_name: 'Goa, India' }]);
    const res = await request(app).get('/api/geocode?q=Goa');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ lat: '15.3', lon: '74.1', display_name: 'Goa, India' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('fetches from Nominatim on a cache miss, caches a non-empty result', async () => {
    const result = [{ lat: '26.9', lon: '75.8', display_name: 'Jaipur, India' }];
    fetch.mockResolvedValue({ ok: true, json: async () => result });

    const res = await request(app).get('/api/geocode?q=Jaipur');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(geocodeCache.set).toHaveBeenCalledWith('jaipur', result);

    // Confirms the query is scoped to India, per the upstream URL contract
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('Jaipur') + '+India');
  });

  test('does not cache an empty result (may be a transient typo, not worth an hour-long lock-in)', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await request(app).get('/api/geocode?q=asdkjaskjd');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(geocodeCache.set).not.toHaveBeenCalled();
  });

  test('falls back to Photon and still returns 200 when Nominatim returns a non-ok status', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429 }) // Nominatim fails
      .mockResolvedValueOnce({ // Photon succeeds
        ok: true,
        json: async () => ({
          features: [{ geometry: { coordinates: [75.8, 26.9] }, properties: { name: 'Jaipur', state: 'Rajasthan', country: 'India' } }],
        }),
      });
    const res = await request(app).get('/api/geocode?q=Jaipur');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].lat).toBe('26.9');
    expect(res.body[0].lon).toBe('75.8');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('falls back to Photon on a Nominatim network-level failure', async () => {
    fetch
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND')) // Nominatim fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [{ geometry: { coordinates: [72.8, 19.0] }, properties: { name: 'Mumbai' } }] }),
      });
    const res = await request(app).get('/api/geocode?q=Mumbai');
    expect(res.status).toBe(200);
    expect(res.body[0].lat).toBe('19');
  });

  test('returns an empty array with 200 (not a 500) when BOTH Nominatim and Photon fail', async () => {
    fetch.mockRejectedValue(new Error('all upstreams down'));
    const res = await request(app).get('/api/geocode?q=Nowhere');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(geocodeCache.set).not.toHaveBeenCalled();
  });

  test('does not fall back to Photon when Nominatim itself returns a non-empty result', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [{ lat: '26.9', lon: '75.8' }] });
    await request(app).get('/api/geocode?q=Jaipur');
    expect(fetch).toHaveBeenCalledTimes(1); // Photon never called
  });

  test('lowercases the cache key so "Jaipur" and "jaipur" share a cache entry', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [{ lat: '1', lon: '1' }] });
    await request(app).get('/api/geocode?q=JAIPUR');
    expect(geocodeCache.get).toHaveBeenCalledWith('jaipur');
    expect(geocodeCache.set).toHaveBeenCalledWith('jaipur', expect.any(Array));
  });
});
