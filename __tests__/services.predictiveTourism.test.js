'use strict';

const {
  predictMultiHorizonForecast,
  generatePredictiveOpportunityAlerts,
} = require('../services/travelIntelligence/predictiveTourism');

describe('Predictive Tourism Intelligence (predictiveTourism.js)', () => {
  const mockPlace = {
    id: 'k1',
    name: 'Kailasagiri Hilltop',
    cat: 'viewpoint',
    coords: [17.7478, 83.3364],
    is_sunset_spot: true,
  };

  test('predicts future destination conditions across multi-horizons with confidence', () => {
    const forecast = predictMultiHorizonForecast(mockPlace, {
      weather: { tempC: 27, condition: 'Clear', precipitationProbability: 5, visibilityKm: 12 },
    });

    expect(forecast).toHaveProperty('now');
    expect(forecast).toHaveProperty('tomorrow');
    expect(forecast).toHaveProperty('weekend');
    expect(forecast.tomorrow.compositeSuitabilityScore).toBeGreaterThanOrEqual(70);
    expect(forecast.tomorrow.confidence).toBeGreaterThanOrEqual(70);
  });

  test('generates actionable predictive opportunity alerts for high-suitability destinations', () => {
    const places = [
      mockPlace,
      { id: 'm1', name: 'Submarine Museum', cat: 'museum' },
    ];

    const alerts = generatePredictiveOpportunityAlerts(places, 'TOMORROW', {
      weather: { tempC: 26, condition: 'Clear', precipitationProbability: 5, visibilityKm: 15 },
    });

    expect(Array.isArray(alerts)).toBe(true);
    if (alerts.length > 0) {
      expect(alerts[0]).toHaveProperty('alert');
      expect(alerts[0]).toHaveProperty('suitabilityScore');
    }
  });
});
