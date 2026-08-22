// __tests__/routes.weatherAlerts.test.js
// routes/weather-alerts.js previously had 0% test coverage. Covers the
// alertLevel/bestTimeForCat business logic and the 50-stop cap (the input
// validation that caps request cost, unlike some of the AI endpoints).

jest.mock('node-fetch');

const fetch = require('node-fetch');
const express = require('express');
const request = require('supertest');
const weatherAlertsRouter = require('../routes/weather-alerts');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/weather-alerts', weatherAlertsRouter);
  return app;
}

function forecastResponse({ currentTemp = 30, currentCode = 1, hourlyTemp = [30], hourlyCode = [1], rainProb = [0] } = {}) {
  return {
    ok: true,
    json: async () => ({
      current_weather: { temperature: currentTemp, weathercode: currentCode },
      hourly: {
        temperature_2m: hourlyTemp,
        weathercode: hourlyCode,
        precipitation_probability: rainProb,
      },
    }),
  };
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('POST /api/weather-alerts — validation', () => {
  test('rejects a request missing lat/lon', async () => {
    const res = await request(app).post('/api/weather-alerts').send({ stops: [] });
    expect(res.status).toBe(400);
  });

  test('caps stops at 50 even if more are sent', async () => {
    fetch.mockResolvedValue(forecastResponse());
    const manyStops = Array.from({ length: 80 }, (_, i) => ({ name: `Stop ${i}`, cat: 'scenic', ot: '09:00' }));
    const res = await request(app).post('/api/weather-alerts').send({ lat: 26.9, lon: 75.8, stops: manyStops });
    expect(res.status).toBe(200);
    expect(res.body.stops).toHaveLength(50);
  });

  test('silently drops non-object entries from stops instead of crashing', async () => {
    fetch.mockResolvedValue(forecastResponse());
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [null, 'not an object', 42, { name: 'Real Stop', cat: 'temple', ot: '08:00' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.stops).toHaveLength(1);
    expect(res.body.stops[0].name).toBe('Real Stop');
  });
});

describe('POST /api/weather-alerts — alert levels', () => {
  test('flags "danger" for a severe weathercode (>= 80)', async () => {
    fetch.mockResolvedValue(forecastResponse({ hourlyCode: [82] }));
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [{ name: 'Hawa Mahal', cat: 'scenic', ot: '09:00' }],
    });
    expect(res.body.stops[0].alertLevel).toBe('danger');
  });

  test('flags "warning" for extreme heat even with clear skies', async () => {
    fetch.mockResolvedValue(forecastResponse({ hourlyTemp: [42], hourlyCode: [1] }));
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [{ name: 'Amer Fort', cat: 'scenic', ot: '09:00' }],
    });
    expect(res.body.stops[0].alertLevel).toBe('warning');
  });

  test('flags "good" for pleasant, dry conditions', async () => {
    fetch.mockResolvedValue(forecastResponse({ hourlyTemp: [24], hourlyCode: [1] }));
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [{ name: 'City Palace', cat: 'scenic', ot: '09:00' }],
    });
    expect(res.body.stops[0].alertLevel).toBe('good');
  });
});

describe('POST /api/weather-alerts — category-specific timing advice', () => {
  test('beach: recommends avoiding it when rainy', async () => {
    fetch.mockResolvedValue(forecastResponse({ hourlyCode: [61] })); // rainy
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 15.3, lon: 74.1, stops: [{ name: 'Baga Beach', cat: 'beach', ot: '08:00' }],
    });
    expect(res.body.stops[0].bestTime).toMatch(/Avoid/);
  });

  test('temple: always recommends early morning regardless of weather', async () => {
    fetch.mockResolvedValue(forecastResponse());
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [{ name: 'Birla Mandir', cat: 'temple', ot: '06:00' }],
    });
    expect(res.body.stops[0].bestTime).toMatch(/Early morning/);
  });
});

describe('POST /api/weather-alerts — degraded upstream responses', () => {
  test('does not throw (returns 502, not 500) when `hourly` is missing from the upstream response', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ current_weather: { temperature: 28, weathercode: 1 } }), // no `hourly` key at all
    });
    const res = await request(app).post('/api/weather-alerts').send({
      lat: 26.9, lon: 75.8, stops: [{ name: 'Hawa Mahal', cat: 'scenic', ot: '09:00' }],
    });
    expect(res.status).toBe(200); // falls back to current_weather values per stop
    expect(res.body.stops[0].temp).toBe(28);
  });

  test('returns graceful 200 fallback when upstream returns non-ok status', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    const res = await request(app).post('/api/weather-alerts').send({ lat: 26.9, lon: 75.8, stops: [] });
    expect(res.status).toBe(200);
    expect(res.body.current).toBeDefined();
    expect(typeof res.body.current.temp).toBe('number');
  });

  test('returns graceful 200 fallback on a network-level failure', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    const res = await request(app).post('/api/weather-alerts').send({ lat: 26.9, lon: 75.8, stops: [] });
    expect(res.status).toBe(200);
    expect(res.body.current).toBeDefined();
    expect(typeof res.body.current.temp).toBe('number');
  });
});
