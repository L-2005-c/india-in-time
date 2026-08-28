// __tests__/routes.itineraryConsistency.test.js
// Regression test: Asserts that all itinerary scoring and optimization endpoints
// consistently delegate to the authoritative advancedItineraryEngine.
'use strict';

const request = require('supertest');
const express = require('express');
const timeIntelRoutes = require('../routes/time-intelligence');
const itineraryOptimizerRoutes = require('../routes/itinerary-optimizer');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');
const { buildDayPlan } = require('../services/travelIntelligence');

const app = express();
app.use(express.json());
app.use('/api/time-intelligence', timeIntelRoutes);
app.use('/api/itinerary', itineraryOptimizerRoutes);

const TEST_PLACES = [
  { name: 'Amber Fort', cat: 'fort', ot: '08:00', ct: '17:30', coords: [26.9855, 75.8513], vt: 90 },
  { name: 'Hawa Mahal', cat: 'monument', ot: '09:00', ct: '17:00', coords: [26.9239, 75.8267], vt: 45, is_sunset_spot: true },
  { name: 'LMB Restaurant', cat: 'food', ot: '08:00', ct: '23:00', coords: [26.9200, 75.8200], vt: 50 },
  { name: 'City Palace', cat: 'museum', ot: '09:30', ct: '17:00', coords: [26.9258, 75.8236], vt: 60 },
];

describe('Itinerary Engine Unification & Route Consistency', () => {
  test('direct buildDayPlan delegates to advancedItineraryEngine with consistent output', () => {
    const directPlan = buildDayPlan(TEST_PLACES, {
      now: new Date('2026-01-15T09:00:00+05:30'),
      originCoords: [26.9124, 75.7873],
      startMin: 540,
      endMin: 1080,
    });

    const advancedPlan = planAdvancedItinerary(TEST_PLACES, {
      now: new Date('2026-01-15T09:00:00+05:30'),
      originCoords: [26.9124, 75.7873],
      startMin: 540,
      endMin: 1080,
    });

    expect(directPlan.stopCount).toBe(advancedPlan.stopCount);
    expect(directPlan.stops[0].name).toBe(advancedPlan.stops[0].name);
    expect(directPlan.optimizer).toMatch(/beam-search|2-opt/);
  });

  test('POST /api/time-intelligence/optimize returns valid authoritative plan', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/optimize')
      .send({
        places: TEST_PLACES,
        fromCoords: [26.9124, 75.7873],
        startMin: 540,
        endMin: 1080,
        at: '2026-01-15T09:00:00+05:30',
      });

    expect(res.status).toBe(200);
    expect(res.body.stops).toBeDefined();
    expect(res.body.stops.length).toBeGreaterThan(0);
    expect(res.body.algorithm).toContain('beam-search');
  });

  test('POST /api/itinerary/optimize delegates to advancedItineraryEngine with consistent stops', async () => {
    const res = await request(app)
      .post('/api/itinerary/optimize')
      .send({
        places: TEST_PLACES,
        startCoord: [26.9124, 75.7873],
        totalMinutes: 540,
        startMin: 540,
        endMin: 1080,
        at: '2026-01-15T09:00:00+05:30',
      });

    expect(res.status).toBe(200);
    expect(res.body.stops).toBeDefined();
    expect(res.body.stops.length).toBeGreaterThan(0);
    expect(res.body.summary.strategy).toBe('authoritative-advanced-beam-search');
    expect(res.body.summary.optimizer).toBe('beam-search-2-opt');
  });

  test('POST /api/itinerary/cluster returns proximity clusters without altering scoring', async () => {
    const res = await request(app)
      .post('/api/itinerary/cluster')
      .send({
        places: TEST_PLACES,
        centerCoord: [26.92, 75.82],
        radiusKm: 5,
      });

    expect(res.status).toBe(200);
    expect(res.body.foundPlaces).toBeGreaterThan(0);
    expect(Array.isArray(res.body.clusters)).toBe(true);
  });
});
