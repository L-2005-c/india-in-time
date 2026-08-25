'use strict';

const {
  CLIMATE_MODES,
  computeHeatIndex,
  analyzeClimateStrategy,
  scorePlaceUnderClimate,
} = require('../services/travelIntelligence/climateEngine');

describe('Unified Climate Engine (climateEngine.js)', () => {
  test('computes Steadman Heat Index correctly', () => {
    // Normal 28°C @ 50% humidity
    const hiNormal = computeHeatIndex(28, 50);
    expect(hiNormal).toBeGreaterThanOrEqual(27);
    expect(hiNormal).toBeLessThanOrEqual(32);

    // High heat 36°C @ 70% humidity -> high heat index
    const hiHigh = computeHeatIndex(36, 70);
    expect(hiHigh).toBeGreaterThan(42); // Extreme heat category
  });

  test('classifies HEAT_ESCAPE strategy when temperature is high', () => {
    const hotWeather = {
      tempC: 36,
      humidity: 60,
      condition: 'Sunny',
      hourly: [
        { time: '10:00', tempC: 32, humidity: 60 },
        { time: '13:00', tempC: 37, humidity: 60 },
        { time: '17:00', tempC: 31, humidity: 65 },
      ],
    };

    const strategy = analyzeClimateStrategy(hotWeather);
    expect([CLIMATE_MODES.HEAT_ESCAPE, CLIMATE_MODES.EXTREME_HEAT]).toContain(strategy.mode);
    expect(strategy.banner).toBeTruthy();
    expect(strategy.banner.title).toContain('Heat');
  });

  test('prioritizes indoor AC venues during midday heat and outdoor recovery in evening', () => {
    const strategy = {
      mode: CLIMATE_MODES.HEAT_ESCAPE,
      heatPeakWindow: { start: 12 * 60, end: 15 * 60 + 45 },
      outdoorRecoveryWindow: { start: 16 * 60, end: 19 * 60 + 30 },
      dryWindows: [],
    };

    const beach = { name: 'RK Beach', cat: 'beach', indoor_outdoor: 'outdoor' };
    const museum = { name: 'Visakha Museum', cat: 'museum', indoor_outdoor: 'indoor', has_ac: true };

    // At 13:30 (Midday Heat): Beach is penalized, Museum is rewarded
    const beachMidday = scorePlaceUnderClimate(beach, 13 * 60 + 30, strategy, { tempC: 36 });
    const museumMidday = scorePlaceUnderClimate(museum, 13 * 60 + 30, strategy, { tempC: 36 });

    expect(beachMidday.delta).toBeLessThan(0);
    expect(museumMidday.delta).toBeGreaterThan(0);

    // At 17:00 (Outdoor Recovery): Beach is rewarded
    const beachEvening = scorePlaceUnderClimate(beach, 17 * 60, strategy, { tempC: 30 });
    expect(beachEvening.delta).toBeGreaterThan(0);
  });

  test('identifies Monsoon Rain Windows and rewards waterfalls during dry spells', () => {
    const rainyWeather = {
      tempC: 26,
      humidity: 90,
      condition: 'Rain',
      hourly: [
        { time: '09:00', tempC: 25, precipProbability: 80 },
        { time: '11:00', tempC: 26, precipProbability: 85 },
        { time: '14:00', tempC: 27, precipProbability: 15 }, // Dry window
        { time: '16:00', tempC: 26, precipProbability: 10 }, // Dry window
        { time: '18:00', tempC: 25, precipProbability: 75 },
      ],
    };

    const strategy = analyzeClimateStrategy(rainyWeather);
    expect([CLIMATE_MODES.MONSOON, CLIMATE_MODES.RAIN_WINDOW]).toContain(strategy.mode);

    const waterfall = { name: 'Katamki Waterfall', cat: 'waterfall', indoor_outdoor: 'outdoor' };
    const waterfallInDry = scorePlaceUnderClimate(waterfall, 15 * 60, strategy, { tempC: 26 });
    expect(waterfallInDry.delta).toBeGreaterThan(0);
    expect(waterfallInDry.reasons.some(r => r.includes('Monsoon dry window'))).toBe(true);
  });
});
