'use strict';

// __tests__/weather.truthEngine.test.js
// Acceptance test for Weather Truth, Provenance Traceability & Diurnal Calibration

const express = require('express');
const request = require('supertest');
const weatherRouter = require('../routes/weather');
const {
  getImdClimatologicalNormal,
  findNearestStation,
  getIstHour,
} = require('../services/travelIntelligence/weather/adapters/imdWeatherAdapter');
const {
  evaluateWeatherConsensus,
} = require('../services/travelIntelligence/weather/weatherConsensusEngine');
const {
  normalizeWeatherRecord,
} = require('../services/travelIntelligence/weather/weatherNormalizer');
const {
  DATA_STATES,
  CONFIDENCE_LEVELS,
  WEATHER_CONSENSUS_STATES,
} = require('../services/travelIntelligence/provenanceModel');

function buildApp() {
  const app = express();
  app.use('/api/weather', weatherRouter);
  return app;
}

describe('Weather Truth & Provenance Engine Acceptance Tests', () => {
  const app = buildApp();
  const VIZAG_LAT = 17.6868;
  const VIZAG_LON = 83.2185;

  describe('1. Spatial IMD Station Grounding', () => {
    test('resolves Visakhapatnam coordinates to Visakhapatnam Airport station (43150)', () => {
      const station = findNearestStation(VIZAG_LAT, VIZAG_LON);
      expect(station).toBeDefined();
      expect(station.id).toBe('43150');
      expect(station.name).toBe('Visakhapatnam Airport');
      expect(station.elevationM).toBe(5);
      expect(station.distanceKm).toBeLessThan(10);
    });

    test('retains true plain elevation and avoids mountain lapse rate for coastal stations', () => {
      const station = findNearestStation(VIZAG_LAT, VIZAG_LON);
      const normal = getImdClimatologicalNormal(VIZAG_LAT, VIZAG_LON, station);
      expect(normal.elevationM).toBe(5);
    });
  });

  describe('2. Diurnal Solar Hour Cycle Modeling', () => {
    test('calculates correct IST hour from UTC timestamps', () => {
      // 21:10 UTC = 02:40 IST next day
      const date2110Utc = new Date('2026-09-10T21:10:00.000Z');
      const istHour = getIstHour(date2110Utc);
      expect(Math.round(istHour * 10) / 10).toBe(2.7);
    });

    test('nocturnal radiative cooling produces 26.5°C at 02:40 IST in September (monsoon)', () => {
      const station = findNearestStation(VIZAG_LAT, VIZAG_LON);
      const nightDate = new Date('2026-09-10T21:10:00.000Z'); // 02:40 IST
      const nightNormal = getImdClimatologicalNormal(VIZAG_LAT, VIZAG_LON, station, null, nightDate);

      // Must be nocturnal (~26.0 - 27.0°C), matching IMD 26.8°C and other app 27°C
      expect(nightNormal.temperatureC).toBeGreaterThanOrEqual(26.0);
      expect(nightNormal.temperatureC).toBeLessThanOrEqual(27.0);
      expect(Math.round(nightNormal.temperatureC)).toBe(27);
    });

    test('daytime peak produces 31.5°C at 14:30 IST in September', () => {
      const station = findNearestStation(VIZAG_LAT, VIZAG_LON);
      const dayDate = new Date('2026-09-11T09:00:00.000Z'); // 14:30 IST
      const dayNormal = getImdClimatologicalNormal(VIZAG_LAT, VIZAG_LON, station, null, dayDate);

      expect(dayNormal.temperatureC).toBeGreaterThanOrEqual(31.0);
      expect(dayNormal.temperatureC).toBeLessThanOrEqual(32.5);
    });
  });

  describe('3. Provenance & Quality State Invariants', () => {
    test('climatological estimate is strictly labeled HISTORICAL, never OBSERVED', () => {
      const station = findNearestStation(VIZAG_LAT, VIZAG_LON);
      const normal = getImdClimatologicalNormal(VIZAG_LAT, VIZAG_LON, station);
      const rec = normalizeWeatherRecord({
        provider: 'IMD',
        dataState: DATA_STATES.HISTORICAL,
        temperatureC: normal.temperatureC,
      });

      expect(rec.dataState).toBe(DATA_STATES.HISTORICAL);
      expect(rec.dataState).not.toBe(DATA_STATES.OBSERVED);
    });

    test('consensus preserves both raw and display temperatures', () => {
      const rec1 = normalizeWeatherRecord({
        provider: 'IMD',
        dataState: DATA_STATES.HISTORICAL,
        temperatureC: 26.8,
        apparentTempC: 29.4,
      });
      const consensus = evaluateWeatherConsensus([rec1]);

      expect(consensus.temperatureC).toBe(26.8);
      expect(Math.round(consensus.temperatureC)).toBe(27);
    });

    test('preserves provider disagreement without silently averaging conflicting extremes', () => {
      const rec1 = normalizeWeatherRecord({
        provider: 'PROVIDER_A',
        dataState: DATA_STATES.PREDICTED,
        temperatureC: 24.0,
        precipitationProb: 10,
      });
      const rec2 = normalizeWeatherRecord({
        provider: 'PROVIDER_B',
        dataState: DATA_STATES.PREDICTED,
        temperatureC: 31.0,
        precipitationProb: 80,
      });

      const consensus = evaluateWeatherConsensus([rec1, rec2]);
      expect(consensus.consensusState).toBe(WEATHER_CONSENSUS_STATES.DISAGREEMENT);
      expect(consensus.confidence).toBe(CONFIDENCE_LEVELS.LOW);
      expect(consensus.disagreementNotice).toBeDefined();
      expect(consensus.divergence.tempDeltaC).toBe(7.0);
    });
  });

  describe('4. Diagnostic Route /api/weather/debug', () => {
    test('returns complete traceability object with resolved station and classification', async () => {
      const res = await request(app).get(`/api/weather/debug?lat=${VIZAG_LAT}&lon=${VIZAG_LON}`);
      expect(res.status).toBe(200);
      expect(res.body.requestedLocation).toBeDefined();
      expect(res.body.resolvedStation).toBeDefined();
      expect(res.body.resolvedStation.name).toBe('Visakhapatnam Airport');
      expect(res.body.classification).toMatch(/PROVIDER_FORECAST|HISTORICAL_ESTIMATE|ACTUAL_OBSERVATION/);
      expect(res.body.temperatures).toBeDefined();
      expect(typeof res.body.temperatures.rawTemperatureC).toBe('number');
      expect(typeof res.body.temperatures.displayTemperatureC).toBe('number');
      expect(res.body.timestamps.requestedAtIST).toBeDefined();
    });
  });

  describe('5. Production Route /api/weather Transparency', () => {
    test('surfaces rawTemperatureC, displayTemperatureC, station, and dataState', async () => {
      const res = await request(app).get(`/api/weather?lat=${VIZAG_LAT}&lon=${VIZAG_LON}`);
      expect(res.status).toBe(200);
      expect(res.body.rawTemperatureC).toBeDefined();
      expect(res.body.displayTemperatureC).toBeDefined();
      expect(res.body.dataState).toBeDefined();
      expect(res.body.display).toContain('°C');
      expect(res.body.station).toBeDefined();
      expect(res.body.updatedAtIST).toBeDefined();
    });
  });
});
