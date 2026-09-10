'use strict';

/**
 * __tests__/services.weatherTruthEngine.test.js
 *
 * Unit and adversarial tests for India In-Time v3.0 Weather Truth Engine:
 * - Weather Normalization
 * - IMD Altitude Lapse Rate & Regional Microclimates
 * - Multi-Provider Consensus & Disagreement Preservation
 * - Ground Truth Accuracy Tracking (MAE & Hit Rate)
 */

const { normalizeWeatherRecord } = require('../services/travelIntelligence/weather/weatherNormalizer');
const { getImdWeather, findNearestStation } = require('../services/travelIntelligence/weather/adapters/imdWeatherAdapter');
const { evaluateWeatherConsensus } = require('../services/travelIntelligence/weather/weatherConsensusEngine');
const {
  recordForecastSnapshot,
  verifyForecastWithObservation,
  getAggregateWeatherAccuracyMetrics,
  inMemorySnapshots,
  inMemoryAccuracyRecords,
} = require('../services/travelIntelligence/weather/weatherAccuracyTracker');
const { WEATHER_CONSENSUS_STATES, CONFIDENCE_LEVELS, DATA_STATES } = require('../services/travelIntelligence/provenanceModel');

describe('Weather Truth Engine (v3.0)', () => {
  beforeEach(() => {
    inMemorySnapshots.length = 0;
    inMemoryAccuracyRecords.length = 0;
  });

  describe('Weather Normalizer', () => {
    test('normalizes raw telemetry to canonical schema with provenance', () => {
      const norm = normalizeWeatherRecord({
        provider: 'IMD',
        dataState: DATA_STATES.OBSERVED,
        confidence: CONFIDENCE_LEVELS.HIGH,
        latitude: 17.72,
        longitude: 83.30,
        elevationM: 45,
        temperatureC: 28.42,
        apparentTempC: 31.18,
        humidityPercent: 78,
        windKph: 15.6,
        precipitationProb: 20,
        condition: 'Partly Cloudy',
      });

      expect(norm.provider).toBe('IMD');
      expect(norm.dataState).toBe(DATA_STATES.OBSERVED);
      expect(norm.confidence).toBe(CONFIDENCE_LEVELS.HIGH);
      expect(norm.metrics.temperatureC).toBe(28.4);
      expect(norm.metrics.apparentTempC).toBe(31.2);
      expect(norm.metrics.humidityPercent).toBe(78);
      expect(norm.metrics.precipitationProb).toBe(20);
      expect(norm.location.elevationM).toBe(45);
      expect(norm.isAvailable).toBe(true);
    });

    test('returns isAvailable: false when temperature is missing', () => {
      const norm = normalizeWeatherRecord({
        provider: 'OPEN_METEO',
        dataState: DATA_STATES.UNAVAILABLE,
      });
      expect(norm.isAvailable).toBe(false);
      expect(norm.metrics.temperatureC).toBeNull();
    });
  });

  describe('IMD Adapter & Altitude Microclimate', () => {
    test('correctly identifies nearest official IMD stations', () => {
      // Visakhapatnam Beach
      const vizagStation = findNearestStation(17.7142, 83.3237);
      expect(vizagStation.name).toContain('Visakhapatnam');

      // Araku Valley
      const arakuStation = findNearestStation(18.33, 82.87);
      expect(arakuStation.name).toContain('Araku');
      expect(arakuStation.elevationM).toBeGreaterThanOrEqual(900);
    });

    test('applies altitude lapse rate so Araku Valley is noticeably cooler than coastal Visakhapatnam', async () => {
      const vizagWeather = await getImdWeather(17.7142, 83.3237);
      const arakuWeather = await getImdWeather(18.33, 82.87);

      expect(vizagWeather.metrics.temperatureC).toBeGreaterThan(arakuWeather.metrics.temperatureC);
      // Eastern Ghats (900m) should be at least 4°C cooler than sea level (lapse rate)
      const diff = vizagWeather.metrics.temperatureC - arakuWeather.metrics.temperatureC;
      expect(diff).toBeGreaterThanOrEqual(4.0);
    });
  });

  describe('Multi-Provider Consensus Engine', () => {
    test('returns STRONG_CONSENSUS with HIGH confidence when IMD and Open-Meteo agree closely', () => {
      const imdRecord = normalizeWeatherRecord({
        provider: 'IMD',
        dataState: DATA_STATES.OBSERVED,
        temperatureC: 28.0,
        apparentTempC: 30.0,
        precipitationProb: 15,
        humidityPercent: 65,
        windKph: 12,
        condition: 'Clear',
      });

      const omRecord = normalizeWeatherRecord({
        provider: 'OPEN_METEO',
        dataState: DATA_STATES.PREDICTED,
        temperatureC: 28.8,
        apparentTempC: 30.5,
        precipitationProb: 20,
        humidityPercent: 68,
        windKph: 14,
        condition: 'Clear',
      });

      const consensus = evaluateWeatherConsensus([imdRecord, omRecord]);
      expect(consensus.consensusState).toBe(WEATHER_CONSENSUS_STATES.STRONG_CONSENSUS);
      expect(consensus.confidence).toBe(CONFIDENCE_LEVELS.HIGH);
      expect(consensus.temperatureC).toBeCloseTo(28.3, 1);
      expect(consensus.disagreementNotice).toBeNull();
    });

    test('preserves uncertainty and drops confidence to LOW when providers strongly disagree', () => {
      // Adversarial test: Open-Meteo predicts 15% rain, IMD warns of 75% rain
      const imdRecord = normalizeWeatherRecord({
        provider: 'IMD',
        dataState: DATA_STATES.PREDICTED,
        temperatureC: 26.0,
        apparentTempC: 28.0,
        precipitationProb: 75,
        humidityPercent: 85,
        condition: 'Heavy Thunderstorms',
      });

      const omRecord = normalizeWeatherRecord({
        provider: 'OPEN_METEO',
        dataState: DATA_STATES.PREDICTED,
        temperatureC: 32.0, // 6°C delta!
        apparentTempC: 35.0,
        precipitationProb: 15, // 60% rain delta!
        humidityPercent: 55,
        condition: 'Sunny',
      });

      const consensus = evaluateWeatherConsensus([imdRecord, omRecord]);
      expect(consensus.consensusState).toBe(WEATHER_CONSENSUS_STATES.DISAGREEMENT);
      expect(consensus.confidence).toBe(CONFIDENCE_LEVELS.LOW);
      expect(consensus.disagreementNotice).toContain('uncertain due to provider divergence');
      // Takes safety-first pessimistic rain probability (75%)
      expect(consensus.precipitationProb).toBe(75);
    });

    test('handles zero available providers gracefully without hallucinating weather', () => {
      const consensus = evaluateWeatherConsensus([]);
      expect(consensus.consensusState).toBe(WEATHER_CONSENSUS_STATES.UNAVAILABLE);
      expect(consensus.isAvailable).toBe(false);
      expect(consensus.temperatureC).toBeNull();
      expect(consensus.confidence).toBe(CONFIDENCE_LEVELS.LOW);
    });
  });

  describe('Weather Accuracy Tracking', () => {
    test('records forecast snapshots and verifies against ground observations', async () => {
      const snap = await recordForecastSnapshot({
        provider: 'OPEN_METEO',
        lat: 17.72,
        lon: 83.30,
        forecastTargetAt: new Date(),
        forecastTempC: 30.0,
        forecastRainProb: 20,
      });
      expect(snap.id).toBeDefined();

      const verification = await verifyForecastWithObservation({
        snapshotId: snap.id,
        observedTempC: 28.5, // 1.5°C error
        observedRainMm: 0,
      });

      expect(verification.tempAbsoluteError).toBe(1.5);
      expect(verification.accuracyClassification).toBe('EXACT');

      const metrics = getAggregateWeatherAccuracyMetrics();
      expect(metrics.totalEvaluated).toBe(1);
      expect(metrics.temperatureMae).toBe(1.5);
      expect(metrics.rainEventHitRatePercent).toBe(100);
    });
  });
});
