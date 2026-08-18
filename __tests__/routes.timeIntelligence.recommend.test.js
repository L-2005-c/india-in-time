const express = require('express');
const request = require('supertest');
const router = require('../routes/time-intelligence');
function app() {
  const a = express();
  a.use(express.json());
  const { validateTimeIntelRequest } = require('../middleware/validator');
  a.use('/api/time-intelligence', validateTimeIntelRequest, router);
  return a;
}

describe('POST /api/time-intelligence/recommend', () => {
  test('requires places', async () => {
    const res = await request(app()).post('/api/time-intelligence/recommend').send({});
    expect(res.status).toBe(400);
  });
  test('returns ranked list', async () => {
    const res = await request(app()).post('/api/time-intelligence/recommend').send({
      places: [
        { name: 'Amber Fort', cat: 'fort', ot: '09:00', ct: '17:00', coords: [26.9124, 75.7873], is_sunset_spot: true },
        { name: 'City Palace', cat: 'monument', ot: '09:00', ct: '17:00', coords: [26.925, 75.82] },
      ],
      weather: { tempC: 24, condition: 'Clear' },
      at: '2026-01-15T16:00:00+05:30',
    });
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBe(2);
    expect(res.body.recommendations[0]).toHaveProperty('visitScore');
    expect(res.body.recommendations[0]).toHaveProperty('explanation');
  });
});

describe('POST /api/time-intelligence/day-plan', () => {
  test('builds plan', async () => {
    const res = await request(app()).post('/api/time-intelligence/day-plan').send({
      places: [
        { name: 'Amber Fort', cat: 'fort', ot: '09:00', ct: '17:00', coords: [26.9124, 75.7873], is_sunset_spot: true },
        { name: 'Cafe', cat: 'food', ot: '08:00', ct: '22:00', coords: [26.91, 75.79] },
      ],
      weather: { tempC: 24, condition: 'Clear' },
      at: '2026-01-15T09:00:00+05:30',
      fromCoords: [26.91, 75.78],
      maxStops: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stops');
    expect(res.body.stopCount).toBeGreaterThan(0);
  });
});

describe('POST /api/time-intelligence/advice', () => {
  test('returns advice', async () => {
    const res = await request(app()).post('/api/time-intelligence/advice').send({
      place: { name: 'Amber Fort', cat: 'fort', ot: '09:00', ct: '17:00', coords: [26.9124, 75.7873] },
      weather: { tempC: 26, condition: 'Clear' },
      at: '2026-01-15T16:00:00+05:30',
    });
    expect(res.status).toBe(200);
    expect(res.body.advice).toHaveProperty('headline');
    expect(res.body.advice.actions.length).toBeGreaterThan(0);
  });
});

describe('TI validation + live routing flag', () => {
  test('rejects invalid coords', async () => {
    const res = await request(app()).post('/api/time-intelligence/status').send({
      places: [{ name: 'X', coords: [999, 0] }],
    });
    expect(res.status).toBe(400);
  });

  test('rejects non-array places', async () => {
    const res = await request(app()).post('/api/time-intelligence/recommend').send({
      places: 'nope',
    });
    expect(res.status).toBe(400);
  });

  test('enableLiveRouting without fromCoords still ranks (heuristic)', async () => {
    const res = await request(app()).post('/api/time-intelligence/recommend').send({
      places: [
        { name: 'Amber Fort', cat: 'fort', ot: '09:00', ct: '17:00', coords: [26.9124, 75.7873] },
      ],
      enableLiveRouting: true,
      weather: { tempC: 24, condition: 'Clear' },
      at: '2026-01-15T16:00:00+05:30',
    });
    expect(res.status).toBe(200);
    expect(res.body.recommendations[0]).toHaveProperty('visitScore');
  });
});
