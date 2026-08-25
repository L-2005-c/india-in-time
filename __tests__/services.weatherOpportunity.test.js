'use strict';

const {
  classifyWeatherWindow,
  evaluateWeatherOpportunityWindows,
} = require('../services/travelIntelligence/weatherOpportunity');

describe('Weather Opportunity Windows Engine (weatherOpportunity.js)', () => {
  test('classifies clear pleasant weather as EXCELLENT opportunity window', () => {
    const excellentData = {
      tempC: 25,
      precipitationProbability: 5,
      condition: 'Partly Cloudy',
      visibilityKm: 12,
      cloudCover: 35,
    };

    const result = classifyWeatherWindow(excellentData);
    expect(result.tier).toBe('EXCELLENT');
    expect(result.outdoorSuitability).toBeGreaterThanOrEqual(90);
  });

  test('classifies thunderstorm and heavy rain as BAD window', () => {
    const badData = {
      tempC: 26,
      precipitationProbability: 85,
      condition: 'Thunderstorm',
    };

    const result = classifyWeatherWindow(badData);
    expect(result.tier).toBe('BAD');
    expect(result.outdoorSuitability).toBeLessThan(30);
  });

  test('detects IMPROVING weather transitions across hourly forecasts', () => {
    const hourlyForecast = [
      { hour: 14, tempC: 26, rainProb: 75, condition: 'Heavy Rain' },
      { hour: 15, tempC: 26, rainProb: 60, condition: 'Light Rain' },
      { hour: 16, tempC: 27, rainProb: 30, condition: 'Drizzle' },
      { hour: 17, tempC: 27, rainProb: 10, condition: 'Clear' },
      { hour: 18, tempC: 26, rainProb: 5, condition: 'Clear' },
    ];

    const opp = evaluateWeatherOpportunityWindows(hourlyForecast, 14 * 60);
    expect(opp.transition.type).toBe('IMPROVING');
    expect(opp.transition.description).toContain('clearing');
  });
});
