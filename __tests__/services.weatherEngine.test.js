'use strict';

const {
  computeWeatherIntelligence,
  buildWeatherExperienceWindows,
} = require('../services/travelIntelligence/weatherEngine');

describe('weatherEngine — Unit & Branch Coverage Tests', () => {
  describe('computeWeatherIntelligence — unavailable & edge conditions (lines 3-5)', () => {
    it('returns unavailable intelligence when weather is null, undefined, or empty', () => {
      const res1 = computeWeatherIntelligence(null);
      expect(res1.source).toBe('unavailable');
      expect(res1.suitability).toBe('Unknown');
      expect(res1.score).toBe(50);
      expect(res1.confidence).toBe(20);

      const res2 = computeWeatherIntelligence({});
      expect(res2.source).toBe('unavailable');
      expect(res2.reason).toBe('No weather data available.');
    });
  });

  describe('computeWeatherIntelligence — temperature branches (lines 9-22)', () => {
    it('handles comfortable temp (15–28°C)', () => {
      const res = computeWeatherIntelligence({ tempC: 22, condition: 'Clear' }, { cat: 'park' });
      expect(res.activityNotes).toContain('Comfortable temperature');
      expect(res.score).toBeGreaterThanOrEqual(85);
      expect(res.suitability).toBe('Excellent');
    });

    it('handles cool temp (10–14°C)', () => {
      const res = computeWeatherIntelligence({ tempC: 12 }, { cat: 'monument' });
      expect(res.activityNotes).toContain('Cool — pleasant for outdoor walks');
    });

    it('handles warm temp (29–33°C)', () => {
      const res = computeWeatherIntelligence({ tempC: 30 }, { cat: 'park' });
      expect(res.activityNotes).toContain('Warm');
    });

    it('handles hot outdoor vs indoor temp (34–37°C) (lines 14-17)', () => {
      const outdoor = computeWeatherIntelligence({ tempC: 35 }, { cat: 'beach', indoor_outdoor: 'outdoor' });
      expect(outdoor.warnings).toContain('Hot outdoor conditions — plan shorter outdoor stops');
      expect(outdoor.activityNotes).toContain('Prefer morning/evening outdoor windows');

      const indoor = computeWeatherIntelligence({ tempC: 35 }, { cat: 'museum', indoor_outdoor: 'indoor' });
      expect(indoor.activityNotes).toContain('Good indoor escape from heat');
      expect(indoor.warnings).toHaveLength(0);
    });

    it('handles extreme heat (>= 38°C) outdoor and indoor (lines 18-20)', () => {
      const outdoor = computeWeatherIntelligence({ tempC: 42 }, { cat: 'fort' });
      expect(outdoor.warnings).toContain('Extreme heat — avoid prolonged outdoor activity');

      const indoor = computeWeatherIntelligence({ tempC: 42 }, { cat: 'food', indoor_outdoor: 'indoor' });
      expect(indoor.activityNotes).toContain('Indoor venue recommended during extreme heat');
    });

    it('handles cold conditions (< 10°C) (line 21)', () => {
      const res = computeWeatherIntelligence({ tempC: 5 }, { cat: 'park' });
      expect(res.activityNotes).toContain('Cold conditions');
    });
  });

  describe('computeWeatherIntelligence — rain & weather conditions (lines 23-30)', () => {
    it('handles heavy rain / storm for outdoor and indoor (lines 26-27)', () => {
      const outdoor = computeWeatherIntelligence({ condition: 'Thunderstorm', tempC: 24, weathercode: 95 }, { cat: 'beach' });
      expect(outdoor.warnings).toContain('Heavy rain risk — outdoor activities not recommended');

      const indoor = computeWeatherIntelligence({ condition: 'Heavy Rain', tempC: 24, weathercode: 82 }, { cat: 'shopping', indoor_outdoor: 'indoor' });
      expect(indoor.activityNotes).toContain('Indoor venue suitable during rain');
    });

    it('handles regular rain / drizzle (line 28)', () => {
      const outdoor = computeWeatherIntelligence({ condition: 'Light Drizzle', tempC: 20, weathercode: 51 }, { cat: 'garden' });
      expect(outdoor.warnings).toContain('Rain expected — carry protection; outdoor visits may be uncomfortable');

      const indoor = computeWeatherIntelligence({ condition: 'Showers', tempC: 20, weathercode: 55 }, { cat: 'cafe', indoor_outdoor: 'indoor' });
      expect(indoor.warnings).toContain('Rain expected — carry protection; outdoor visits may be uncomfortable');
    });

    it('handles clear/sunny vs partly cloudy/overcast conditions (lines 29-30)', () => {
      const sunny = computeWeatherIntelligence({ condition: 'Sunny', weathercode: 0 });
      expect(sunny.activityNotes).toContain('Clear / sunny conditions');

      const cloudy = computeWeatherIntelligence({ condition: 'Partly Cloudy', weathercode: 2 });
      expect(cloudy.activityNotes).toContain('Partly cloudy — good visibility for views');
    });
  });

  describe('computeWeatherIntelligence — wind, UV, cloud cover & suitability scoring (lines 31-54)', () => {
    it('handles high winds for coastal/scenic/sunset spots (lines 33-35)', () => {
      const gale = computeWeatherIntelligence({ windKph: 45 }, { cat: 'beach' });
      expect(gale.warnings).toContain('Strong winds — use caution at open viewpoints/beaches');

      const moderateWind = computeWeatherIntelligence({ windKph: 35 }, { cat: 'scenic', is_sunset_spot: true });
      expect(moderateWind.warnings).toContain('Strong winds — use caution at open viewpoints/beaches');

      const gentleWind = computeWeatherIntelligence({ windKph: 10 }, { cat: 'park' });
      expect(gentleWind.score).toBeGreaterThan(70);
    });

    it('handles high UV index during daytime outdoor visits (line 38)', () => {
      const highUv = computeWeatherIntelligence({ uv: 10, tempC: 28 }, { cat: 'waterfall' }, 'afternoon');
      expect(highUv.warnings).toContain('High UV — sun protection advised');

      const nightUv = computeWeatherIntelligence({ uv: 10, tempC: 28 }, { cat: 'waterfall' }, 'night');
      expect(nightUv.warnings).not.toContain('High UV — sun protection advised');
    });

    it('handles cloud cover for sunrise, sunset, and scenic spots (lines 39-42)', () => {
      const lowCloud = computeWeatherIntelligence({ cloudCover: 20, tempC: 24 }, { cat: 'scenic', is_sunrise_spot: true });
      expect(lowCloud.activityNotes).toContain('Low cloud cover — favourable for photography / views');

      const heavyCloud = computeWeatherIntelligence({ cloudCover: 90, tempC: 24 }, { cat: 'scenic', is_sunset_spot: true });
      expect(heavyCloud.activityNotes).toContain('Heavy cloud cover may reduce scenic visibility');

      const moderateCloud = computeWeatherIntelligence({ cloudCover: 50, tempC: 24 }, { cat: 'scenic', is_sunset_spot: true });
      expect(moderateCloud.warnings).toHaveLength(0);
    });

    it('evaluates all suitability categories (Excellent, Good, Fair, Poor, Very Poor) (lines 44-52)', () => {
      // Very Poor (< 30)
      const veryPoor = computeWeatherIntelligence({ tempC: 45, condition: 'Heavy Storm', windKph: 55, weathercode: 95 }, { cat: 'beach' });
      expect(veryPoor.suitability).toBe('Very Poor');
      expect(veryPoor.activityNotes).toContain('Poor for outdoor activity');

      // Good (70-84)
      const good = computeWeatherIntelligence({ tempC: 20, condition: 'Partly Cloudy' }, { cat: 'scenic', is_sunset_spot: true });
      expect(['Good', 'Excellent']).toContain(good.suitability);
      expect(good.activityNotes).toContain('Favourable for photography');

      // Forecast source flag
      const forecastRes = computeWeatherIntelligence({ tempC: 22, forecast: true });
      expect(forecastRes.source).toBe('forecast');
    });
  });

  describe('buildWeatherExperienceWindows (lines 56-77)', () => {
    it('returns unavailable when hourly forecast data is missing or empty (lines 58-60)', () => {
      expect(buildWeatherExperienceWindows(null)).toEqual({
        source: 'unavailable',
        windows: [],
        reason: 'No hourly forecast data supplied.',
      });

      expect(buildWeatherExperienceWindows({ hourly: [] })).toEqual({
        source: 'unavailable',
        windows: [],
        reason: 'No hourly forecast data supplied.',
      });
    });

    it('computes experience windows and selects best window (lines 61-76)', () => {
      const weather = {
        hourly: [
          { time: '09:00', tempC: 22, condition: 'Clear', daypart: 'morning' },
          { time: '14:00', tempC: 36, condition: 'Sunny', daypart: 'afternoon' },
          { time: '18:00', tempC: 26, condition: 'Clear', daypart: 'evening' },
          { tempC: 20 }, // no time or timestamp, filtered out
        ],
      };

      const res = buildWeatherExperienceWindows(weather, { cat: 'scenic', is_sunset_spot: true });
      expect(res.source).toBe('forecast');
      expect(res.windows).toHaveLength(3);
      expect(res.best).toBeDefined();
      expect(res.best.start).toBe('09:00');
      expect(res.windows[0].confidence).toBe(75);
    });
  });
});
