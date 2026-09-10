'use strict';

/**
 * __tests__/routes.intelligence.test.js
 *
 * Integration tests for /api/intelligence routes:
 * - Weather Truth & Accuracy Telemetry
 * - Journey State Lifecycle & Stop Progress
 * - Travel Guardian Health Check
 * - Contextual Dynamic Replanning
 * - Controlled Demo Simulation Hook
 */

jest.mock('node-fetch');
const fetch = require('node-fetch');
const express = require('express');
const request = require('supertest');
const intelligenceRouter = require('../routes/intelligence');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence', intelligenceRouter);
  return app;
}

describe('Intelligence & Travel Operating System API (/api/intelligence)', () => {
  const app = buildTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    if (fetch.mockResolvedValue) {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          current_weather: { temperature: 28.5, windspeed: 12, weathercode: 1, time: '2026-09-11T10:00' },
          hourly: {
            time: ['2026-09-11T10:00'],
            temperature_2m: [28.5],
            precipitation_probability: [10],
            precipitation: [0],
            relative_humidity_2m: [65],
            wind_speed_10m: [12],
            uv_index: [4],
            cloud_cover: [20],
          },
        }),
      });
    }
  });

  const samplePlan = {
    stops: [
      { id: 's1', name: 'Borra Caves', cat: 'cave', lat: 18.28, lon: 83.04, visitMinutes: 90 },
      { id: 's2', name: 'Araku Coffee Museum', cat: 'museum', lat: 18.33, lon: 82.87, visitMinutes: 45 },
      { id: 's3', name: 'Padmapuram Gardens', cat: 'nature', lat: 18.32, lon: 82.86, visitMinutes: 60 },
      { id: 's4', name: 'Galikonda View Point', cat: 'viewpoint', lat: 18.25, lon: 82.95, visitMinutes: 60 },
    ],
  };

  test('GET /api/intelligence/health returns healthy system capabilities', async () => {
    const res = await request(app).get('/api/intelligence/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.operatingSystem).toContain('India In-Time v3.0');
    expect(res.body.capabilities.length).toBeGreaterThan(0);
  });

  test('GET /api/intelligence/weather/truth validates coordinates and returns consensus', async () => {
    const badRes = await request(app).get('/api/intelligence/weather/truth');
    expect(badRes.status).toBe(400);

    const goodRes = await request(app)
      .get('/api/intelligence/weather/truth')
      .query({ lat: 17.72, lon: 83.30 });
    expect(goodRes.status).toBe(200);
    expect(goodRes.body).toHaveProperty('consensusState');
    expect(goodRes.body).toHaveProperty('confidence');
  });

  test('GET /api/intelligence/weather/accuracy returns accuracy telemetry', async () => {
    const res = await request(app).get('/api/intelligence/weather/accuracy');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalEvaluated');
  });

  describe('Journey State & Travel Guardian Execution', () => {
    const tripId = 'demo_trip_araku_300';

    test('POST /api/intelligence/trips/:id/state initializes active journey state', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${tripId}/state`)
        .send({
          plan: samplePlan,
          travelerId: 'traveler_007',
          dna: { photography: 90, scenic: 95 },
        });

      expect(res.status).toBe(200);
      expect(res.body.tripId).toBe(tripId);
      expect(res.body.activePlanVersion).toBe(1);
      expect(res.body.activeStop.name).toBe('Borra Caves');
      expect(res.body.upcomingStops).toHaveLength(3);
    });

    test('GET /api/intelligence/trips/:id/state fetches active state', async () => {
      const res = await request(app).get(`/api/intelligence/trips/${tripId}/state`);
      expect(res.status).toBe(200);
      expect(res.body.state.tripId).toBe(tripId);
      expect(res.body.travelerDna.photography).toBe(90);
    });

    test('POST /api/intelligence/trips/:id/state/progress advances stop progress', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${tripId}/state/progress`)
        .send({
          stopId: 's1',
          action: 'COMPLETE',
          currentMinute: 640,
        });

      expect(res.status).toBe(200);
      expect(res.body.completedStopsCount).toBe(1);
      expect(res.body.activeStop.name).toBe('Araku Coffee Museum');
    });

    test('GET /api/intelligence/trips/:id/guardian evaluates trip health', async () => {
      const res = await request(app).get(`/api/intelligence/trips/${tripId}/guardian`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tripHealth');
      expect(res.body).toHaveProperty('shouldReplan');
      expect(res.body.preservedStops).toContain('Borra Caves');
    });

    test('POST /api/intelligence/trips/:id/simulate-event triggers demo event', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${tripId}/simulate-event`)
        .send({ eventType: 'HEAVY_RAIN_GHAT' });

      expect(res.status).toBe(200);
      expect(res.body.dataState).toBe('SIMULATED');
      expect(res.body.guardianEvaluation.tripHealth).toBe('CRITICAL');
      expect(res.body.guardianEvaluation.shouldReplan).toBe(true);
    });

    test('POST /api/intelligence/trips/:id/replan executes contextual adaptation', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${tripId}/replan`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.shouldAdapt).toBe(true);
      expect(res.body.newPlanVersion).toBe(2);
      expect(res.body.preservedStops).toContain('Borra Caves');
      expect(res.body.explanation).toContain('Borra Caves');
    });

    test('GET /api/intelligence/trips/:id/plan-versions returns audit history', async () => {
      const res = await request(app).get(`/api/intelligence/trips/${tripId}/plan-versions`);
      expect(res.status).toBe(200);
      expect(res.body.versionsCount).toBeGreaterThanOrEqual(2);
      expect(res.body.history[0].versionNumber).toBe(1);
      expect(res.body.history[1].versionNumber).toBe(2);
    });
  });
});
