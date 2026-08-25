'use strict';

const {
  calculateSolarTimes,
  classifyTimePhase,
  getScenicScore,
} = require('../services/travelIntelligence/astronomyTime');

describe('Astronomy & Time Intelligence 2.0 (astronomyTime.js)', () => {
  test('calculates accurate solar times for Indian cities', () => {
    // Visakhapatnam (17.6868° N, 83.2185° E)
    const vizag = calculateSolarTimes(17.6868, 83.2185, new Date('2026-06-21T00:00:00Z'));
    expect(vizag.sunrise).toBeGreaterThan(5 * 60); // After 05:00
    expect(vizag.sunrise).toBeLessThan(6 * 60 + 30); // Before 06:30
    expect(vizag.sunset).toBeGreaterThan(18 * 60); // After 18:00
    expect(vizag.sunset).toBeLessThan(19 * 60); // Before 19:00
    expect(vizag.eveningGoldenHour.start).toBeLessThan(vizag.sunset);
    expect(vizag.blueHour.start).toBeGreaterThanOrEqual(vizag.sunset);

    // Delhi (28.6139° N, 77.2090° E)
    const delhi = calculateSolarTimes(28.6139, 77.2090, new Date('2026-06-21T00:00:00Z'));
    expect(delhi.solarNoon).toBeGreaterThan(12 * 60);
    expect(delhi.sunset).toBeGreaterThan(19 * 60);
  });

  test('classifies time phases correctly throughout the day', () => {
    const solarTimes = {
      sunrise: 5 * 60 + 45, // 05:45
      sunset: 18 * 60 + 20, // 18:20
      morningGoldenHour: { start: 5 * 60 + 30, end: 6 * 60 + 30 },
      eveningGoldenHour: { start: 17 * 60 + 20, end: 18 * 60 + 35 },
      blueHour: { start: 18 * 60 + 35, end: 19 * 60 + 0 },
    };

    // 03:00 -> Night
    expect(classifyTimePhase(3 * 60, solarTimes).phase).toBe('NIGHT');

    // 05:50 -> Sunrise Golden Hour
    expect(classifyTimePhase(5 * 60 + 50, solarTimes).phase).toBe('SUNRISE_GOLDEN');

    // 09:00 -> Morning
    expect(classifyTimePhase(9 * 60, solarTimes).phase).toBe('MORNING');

    // 13:00 -> Midday
    expect(classifyTimePhase(13 * 60, solarTimes).phase).toBe('MIDDAY');

    // 17:45 -> Evening Golden Hour
    expect(classifyTimePhase(17 * 60 + 45, solarTimes).phase).toBe('GOLDEN_HOUR');

    // 18:45 -> Blue Hour / Twilight
    expect(classifyTimePhase(18 * 60 + 45, solarTimes).phase).toBe('BLUE_HOUR');

    // 20:30 -> Evening
    expect(classifyTimePhase(20 * 60 + 30, solarTimes).phase).toBe('EVENING');
  });

  test('awards high scenic scores to sunset spots during evening golden hour', () => {
    const solarTimes = calculateSolarTimes(17.6868, 83.2185, new Date('2026-03-21T00:00:00Z'));
    const kailasagiri = { name: 'Kailasagiri', cat: 'scenic', is_sunset_spot: true };

    // At sunset (e.g. 17:50)
    const scoreSunset = getScenicScore(kailasagiri, 17 * 60 + 50, solarTimes, { cloudCover: 30 });
    expect(scoreSunset.score).toBeGreaterThanOrEqual(85);
    expect(scoreSunset.reasons.some(r => r.includes('golden hour'))).toBe(true);

    // At midday (13:00)
    const scoreMidday = getScenicScore(kailasagiri, 13 * 60, solarTimes, {});
    expect(scoreMidday.score).toBeLessThan(scoreSunset.score);
  });
});
