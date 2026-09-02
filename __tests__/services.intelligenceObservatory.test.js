'use strict';

const {
  recordItineraryGeneration,
  recordItineraryAcceptance,
  recordFeedbackEvent,
  recordEtaObservation,
  recordWeatherAdaptation,
  recordFallbackEvent,
  getIntelligenceObservatoryMetrics,
  resetObservatoryForTesting,
} = require('../services/observability/intelligenceObservatory');

describe('Intelligence Observatory (observability)', () => {
  beforeEach(() => {
    resetObservatoryForTesting();
  });

  test('tracks itinerary generation, acceptance, and edits', () => {
    recordItineraryGeneration('Visakhapatnam', 6, 88);
    recordItineraryGeneration('Hyderabad', 7, 85);
    recordItineraryAcceptance('Visakhapatnam');
    recordFeedbackEvent('stop_removed', 'too_far', 'Hyderabad');

    const metrics = getIntelligenceObservatoryMetrics();
    expect(metrics.itineraries.generated).toBe(2);
    expect(metrics.itineraries.accepted).toBe(1);
    expect(metrics.itineraries.acceptanceRatePercent).toBe(50);
    expect(metrics.itineraries.edits.stopRemoved).toBe(1);
    expect(metrics.feedbackReasons.too_far).toBe(1);
  });

  test('records ETA accuracy observations and computes MAE', () => {
    recordEtaObservation('google', 15, 16); // 60s error
    recordEtaObservation('osrm', 20, 22);   // 120s error

    const metrics = getIntelligenceObservatoryMetrics();
    expect(metrics.etaAccuracy.totalObservations).toBe(2);
    expect(metrics.etaAccuracy.meanAbsoluteErrorSec).toBe(90);
  });

  test('records weather adaptation events and subsystem fallbacks', () => {
    recordWeatherAdaptation('rainIndoorSwap');
    recordWeatherAdaptation('heatEscape');
    recordFallbackEvent('traffic', 'provider_timeout');

    const metrics = getIntelligenceObservatoryMetrics();
    expect(metrics.weatherAdaptations.rainIndoorSwap).toBe(1);
    expect(metrics.weatherAdaptations.heatEscape).toBe(1);
    expect(metrics.fallbacks.traffic).toBe(1);
  });
});
