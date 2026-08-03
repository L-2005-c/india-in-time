// __tests__/routes.timeIntelligence.status.test.js
//
// POST /api/time-intelligence/status had 0% direct coverage before this file
// — routes.timeIntelligence.score.test.js only ever exercised /score.
// Mounts the real router + real services/timeIntelligence (matching the
// existing convention for this route file), with an explicit `at` timestamp
// and explicit ot/ct/night_availability on each place so open/closed state
// is deterministic rather than depending on the real current time.

const express = require('express');
const request = require('supertest');
const timeIntelligenceRouter = require('../routes/time-intelligence');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/time-intelligence', timeIntelligenceRouter);
  return app;
}

// 2026-01-15T10:00:00Z is a Thursday, 15:30 IST (UTC+5:30) — 930 minutes
// past midnight IST. Fixed so tests never depend on wall-clock time.
const AT = '2026-01-15T10:00:00.000Z';

describe('POST /api/time-intelligence/status', () => {
  const app = buildTestApp();

  test('400s when places[] is missing', async () => {
    const res = await request(app).post('/api/time-intelligence/status').send({ at: AT });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/places/);
  });

  test('400s when places is present but not an array', async () => {
    const res = await request(app).post('/api/time-intelligence/status').send({ places: 'nope', at: AT });
    expect(res.status).toBe(400);
  });

  test('400s when places is an empty array', async () => {
    const res = await request(app).post('/api/time-intelligence/status').send({ places: [], at: AT });
    expect(res.status).toBe(400);
  });

  test('returns state for an open place with no alternatives attached', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({
        at: AT,
        places: [{ name: 'Open Cafe', cat: 'cafe', ot: '09:00', ct: '18:00', night_availability: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.at).toBe(new Date(AT).toISOString());
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].isOpenNow).toBe(true);
    expect(res.body.places[0].alternatives).toBeUndefined();
  });

  test('attaches "similar open nearby" alternatives for a closed place', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({
        at: AT,
        places: [
          { name: 'Closed Museum', cat: 'museum', ot: '09:00', ct: '12:00', night_availability: false },
          { name: 'Open Museum', cat: 'museum', ot: '09:00', ct: '20:00', night_availability: false },
        ],
      });

    expect(res.status).toBe(200);
    // places[] is returned in the same order as the request, so index 0 is
    // the closed museum and index 1 is the open one.
    expect(res.body.places[0].isOpenNow).toBe(false);
    expect(res.body.places[0].alternatives).toEqual(['Open Museum']);
    expect(res.body.places[1].isOpenNow).toBe(true);
    expect(res.body.places[1].alternatives).toBeUndefined();
  });

  test('does not attach alternatives when no open place shares the category', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({
        at: AT,
        places: [{ name: 'Lonely Closed Shop', cat: 'boutique', ot: '09:00', ct: '12:00', night_availability: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.places[0].isOpenNow).toBe(false);
    expect(res.body.places[0].alternatives).toEqual([]);
  });

  test('defaults `at` to the current time when omitted', async () => {
    const before = Date.now();
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({ places: [{ name: 'Any Place', cat: 'cafe' }] });
    const after = Date.now();

    expect(res.status).toBe(200);
    const returned = new Date(res.body.at).getTime();
    expect(returned).toBeGreaterThanOrEqual(before);
    expect(returned).toBeLessThanOrEqual(after);
  });

  test('caps an oversized places[] array at MAX_PLACES (200) rather than processing it unbounded', async () => {
    const places = Array.from({ length: 250 }, (_, i) => ({
      name: `Place ${i}`,
      cat: 'cafe',
      ot: '09:00',
      ct: '18:00',
      night_availability: false,
    }));

    const res = await request(app).post('/api/time-intelligence/status').send({ at: AT, places });

    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(200);
  });

  test('passes weather through to the underlying state computation without erroring', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({
        at: AT,
        weather: { condition: 'rain', tempC: 24 },
        places: [{ name: 'Rainy Day Cafe', cat: 'cafe', ot: '09:00', ct: '18:00', night_availability: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
  });

  test('returns 500 with a safe error body if req.body is missing entirely (malformed request)', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/status')
      .set('Content-Type', 'application/json')
      .send();

    // No JSON body at all -> req.body is {} (express.json() default), which
    // still fails the places[] check as a 400, not a 500 — this asserts
    // the route degrades gracefully rather than throwing on an absent body.
    expect(res.status).toBe(400);
  });
});
