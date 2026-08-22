// __tests__/routes.weather.test.js
// routes/weather.js previously had 0% test coverage.

jest.mock('node-fetch');

const fetch = require('node-fetch');
const express = require('express');
const request = require('supertest');
const weatherRouter = require('../routes/weather');
const { weatherCache } = require('../services/cache');

function buildApp() {
  const app = express();
  app.use('/api/weather', weatherRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  weatherCache._map.clear();
  app = buildApp();
});

function openMeteoResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      current_weather: { temperature: 28.6, windspeed: 12.4, weathercode: 1, ...overrides },
    }),
  };
}

describe('GET /api/weather', () => {
  test('rejects a request missing lat/lon', async () => {
    const res = await request(app).get('/api/weather');
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns rounded temp/wind and a matching emoji on success', async () => {
    fetch.mockResolvedValue(openMeteoResponse());
    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(res.body.temp).toBe(29); // rounded from 28.6
    expect(res.body.windKph).toBe(12);
    expect(res.body.emoji).toBe('☀️');
    expect(res.body.display).toBe('☀️ 29°C');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('picks the correct emoji per weathercode band', async () => {
    const cases = [
      [0, '☀️'], [3, '⛅'], [45, '☁️'], [61, '🌧️'],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [weathercode, expectedEmoji] = cases[i];
      weatherCache._map.clear();
      fetch.mockResolvedValue(openMeteoResponse({ weathercode }));
      const res = await request(app).get(`/api/weather?lat=${i + 1}&lon=1`);
      expect(res.body.emoji).toBe(expectedEmoji);
    }
  });

  test('retries once on a transient failure and succeeds on the second attempt', async () => {
    fetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(openMeteoResponse());

    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('returns graceful 200 seasonal estimate fallback when both upstream attempts fail', async () => {
    fetch.mockRejectedValue(new Error('upstream down'));
    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(res.body.forecastSource).toBe('seasonal_estimate');
    expect(typeof res.body.temp).toBe('number');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('returns graceful 200 seasonal estimate fallback when upstream times out', async () => {
    const timeoutErr = new Error('The operation was aborted');
    timeoutErr.name = 'TimeoutError';
    fetch.mockRejectedValue(timeoutErr);
    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(res.body.forecastSource).toBe('seasonal_estimate');
  });

  test('returns graceful 200 fallback when upstream response has no current_weather field', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(res.body.forecastSource).toBe('seasonal_estimate');
  });

  test('surfaces non-ok upstream status as trigger for retry then graceful fallback', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' });
    const res = await request(app).get('/api/weather?lat=17.71&lon=83.32');
    expect(res.status).toBe(200);
    expect(res.body.forecastSource).toBe('seasonal_estimate');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
