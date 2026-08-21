// __tests__/services.temporalEngine.additional.test.js
// Extends __tests__/services.temporalEngine.test.js with coverage for
// nearestHourlyWeather, more buildWindows/selectModes branches,
// confidenceSummary edge cases, and a full buildTemporalProfile run — the
// end-to-end function that assembles a place's multi-day time profile.

'use strict';

const {
  buildTemporalProfile,
  nearestHourlyWeather,
  buildWindows,
  selectModes,
  confidenceSummary,
} = require('../services/travelIntelligence/temporalEngine');

describe('temporalEngine (additional coverage)', () => {
  describe('nearestHourlyWeather', () => {
    test('returns null when there is no hourly data', () => {
      expect(nearestHourlyWeather(null, new Date())).toBeNull();
      expect(nearestHourlyWeather({ hourly: [] }, new Date())).toBeNull();
    });

    test('returns the closest hourly entry within a 3-hour window', () => {
      const at = new Date('2026-08-16T10:00:00+05:30');
      const weather = {
        hourly: [
          { time: '2026-08-16T08:00:00+05:30', temp: 20 },
          { time: '2026-08-16T09:45:00+05:30', temp: 25 },
          { time: '2026-08-16T13:00:00+05:30', temp: 30 },
        ],
      };
      const result = nearestHourlyWeather(weather, at);
      expect(result.temp).toBe(25);
    });

    test('accepts "timestamp" or "datetime" keys in addition to "time"', () => {
      const at = new Date('2026-08-16T10:00:00+05:30');
      const weather = { hourly: [{ timestamp: '2026-08-16T10:00:00+05:30', temp: 27 }] };
      expect(nearestHourlyWeather(weather, at).temp).toBe(27);
      const weather2 = { hourly: [{ datetime: '2026-08-16T10:00:00+05:30', temp: 28 }] };
      expect(nearestHourlyWeather(weather2, at).temp).toBe(28);
    });

    test('ignores rows with unparsable timestamps', () => {
      const at = new Date('2026-08-16T10:00:00+05:30');
      const weather = { hourly: [{ time: 'not-a-date', temp: 99 }, { time: '2026-08-16T10:05:00+05:30', temp: 26 }] };
      expect(nearestHourlyWeather(weather, at).temp).toBe(26);
    });

    test('returns null when the nearest entry is more than 3 hours away', () => {
      const at = new Date('2026-08-16T10:00:00+05:30');
      const weather = { hourly: [{ time: '2026-08-16T20:00:00+05:30', temp: 20 }] };
      expect(nearestHourlyWeather(weather, at)).toBeNull();
    });
  });

  describe('buildWindows', () => {
    test('returns an empty array when no points meet the minimum score', () => {
      const points = [{ dayKey: 'd', dayOffset: 0, minute: 600, stepMin: 30, score: 40, confidence: 50, reasons: [] }];
      expect(buildWindows(points, 60)).toEqual([]);
    });

    test('splits points into separate windows when the gap exceeds stepMin + 5', () => {
      const windows = buildWindows([
        { dayKey: 'd', dayOffset: 0, minute: 600, stepMin: 30, score: 70, confidence: 70, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
        { dayKey: 'd', dayOffset: 0, minute: 900, stepMin: 30, score: 75, confidence: 72, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
      ], 60);
      expect(windows).toHaveLength(2);
    });

    test('splits windows across different days even if minutes are numerically close', () => {
      const windows = buildWindows([
        { dayKey: '2026-08-16', dayOffset: 0, minute: 1400, stepMin: 30, score: 70, confidence: 70, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
        { dayKey: '2026-08-17', dayOffset: 1, minute: 10, stepMin: 30, score: 75, confidence: 72, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
      ], 60);
      expect(windows).toHaveLength(2);
      expect(windows.some((w) => w.dayKey === '2026-08-16')).toBe(true);
      expect(windows.some((w) => w.dayKey === '2026-08-17')).toBe(true);
    });

    test('sorts windows by score descending, then by day offset, then by start time', () => {
      const windows = buildWindows([
        { dayKey: 'a', dayOffset: 1, minute: 600, stepMin: 30, score: 65, confidence: 60, reasons: [], weatherSource: 'x', crowdSource: 'x', trafficSource: 'x', scenicSource: 'x' },
        { dayKey: 'b', dayOffset: 0, minute: 1000, stepMin: 30, score: 90, confidence: 80, reasons: [], weatherSource: 'x', crowdSource: 'x', trafficSource: 'x', scenicSource: 'x' },
      ], 60);
      expect(windows[0].score).toBe(90);
      expect(windows[1].score).toBe(65);
    });

    test('deduplicates and caps reasons at 8 entries', () => {
      const manyReasons = Array.from({ length: 12 }, (_, i) => `reason-${i % 4}`); // only 4 unique
      const windows = buildWindows([
        { dayKey: 'd', dayOffset: 0, minute: 600, stepMin: 30, score: 80, confidence: 80, reasons: manyReasons, weatherSource: 'x', crowdSource: 'x', trafficSource: 'x', scenicSource: 'x' },
      ], 60);
      expect(windows[0].reasons.length).toBeLessThanOrEqual(8);
      expect(new Set(windows[0].reasons).size).toBe(windows[0].reasons.length);
    });
  });

  describe('selectModes', () => {
    const reference = new Date('2026-08-16T10:00:00+05:30');

    test('returns all-null modes when there are no windows', () => {
      const modes = selectModes([], reference);
      expect(modes.BEST_NOW).toBeNull();
      expect(modes.BEST_LATER).toBeNull();
      expect(modes.BEST_OVERALL).toBeNull();
    });

    test('identifies BEST_NOW when a window spans the current time', () => {
      const windows = [{ dayKey: 'd', dayOffset: 0, startMin: 590, endMin: 610, score: 80, reasons: [] }];
      expect(selectModes(windows, reference).BEST_NOW.score).toBe(80);
    });

    test('identifies BEST_MORNING and BEST_EVENING independently', () => {
      const windows = [
        { dayKey: 'd', dayOffset: 1, startMin: 6 * 60, endMin: 7 * 60, score: 60, reasons: [] },
        { dayKey: 'd', dayOffset: 0, startMin: 17 * 60, endMin: 18 * 60, score: 88, reasons: ['sunset glow'] },
      ];
      const modes = selectModes(windows, reference);
      expect(modes.BEST_MORNING.score).toBe(60);
      expect(modes.BEST_EVENING.score).toBe(88);
    });

    test('identifies BEST_PHOTOGRAPHY_WINDOW via reason keywords', () => {
      const windows = [
        { dayKey: 'd', dayOffset: 0, startMin: 700, endMin: 720, score: 70, reasons: ['clear skies'] },
        { dayKey: 'd', dayOffset: 0, startMin: 1080, endMin: 1100, score: 92, reasons: ['golden hour photography'] },
      ];
      expect(selectModes(windows, reference).BEST_PHOTOGRAPHY_WINDOW.score).toBe(92);
    });

    test('excludes past, same-day windows from all future-facing modes', () => {
      const windows = [{ dayKey: 'd', dayOffset: 0, startMin: 60, endMin: 120, score: 99, reasons: [] }]; // 1am-2am, long past
      const modes = selectModes(windows, reference);
      expect(modes.BEST_OVERALL).toBeNull();
    });
  });

  describe('confidenceSummary', () => {
    test('returns a zero-confidence LOW result for an empty point list', () => {
      const result = confidenceSummary([]);
      expect(result.score).toBe(0);
      expect(result.level).toBe('LOW');
      expect(result.reasons).toEqual(['No usable temporal observations.']);
    });

    test('reports HIGH confidence when average confidence is >= 80 and all evidence sources are present', () => {
      const points = [
        { confidence: 90, weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'live_traffic' },
        { confidence: 88, weatherSource: 'forecast', crowdSource: 'observed', trafficSource: 'route_estimate' },
      ];
      const result = confidenceSummary(points);
      expect(result.level).toBe('HIGH');
      expect(result.reasons).toEqual(['Multiple independent signals available.']);
    });

    test('reports MEDIUM confidence in the 60-79 average band', () => {
      const points = [{ confidence: 65, weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'route_estimate' }];
      expect(confidenceSummary(points).level).toBe('MEDIUM');
    });
  });

  describe('buildTemporalProfile (end-to-end)', () => {
    const place = {
      id: 1,
      name: 'Kailasagiri',
      cat: 'scenic',
      coords: [17.748, 83.342],
      is_sunset_spot: true,
      vt: 60,
    };

    test('produces a well-formed profile over a short horizon', () => {
      const referenceDate = new Date('2026-08-16T09:00:00+05:30');
      const profile = buildTemporalProfile(place, {
        referenceDate,
        stepMin: 60,
        horizonMin: 6 * 60, // small horizon keeps the test fast
      });

      expect(profile.place).toBe('Kailasagiri');
      expect(profile.points.length).toBeGreaterThan(0);
      expect(profile.modes).toHaveProperty('BEST_OVERALL');
      expect(profile.confidence).toHaveProperty('uncertaintyBand');
      expect(profile.confidence).toHaveProperty('robustnessScore');
      expect(profile.temporalOpportunity).toHaveProperty('label');
      expect(Array.isArray(profile.days)).toBe(true);
      expect(profile.dataQuality).toHaveProperty('futureDaysEvaluated');
    });

    test('clamps stepMin to a minimum of 15 minutes even if a smaller value is requested', () => {
      const referenceDate = new Date('2026-08-16T09:00:00+05:30');
      const profile = buildTemporalProfile(place, {
        referenceDate,
        stepMin: 1,
        horizonMin: 60,
      });
      expect(profile.resolutionMinutes).toBe(15);
    });

    test('clamps horizon to the documented maximum (72 hours)', () => {
      const referenceDate = new Date('2026-08-16T09:00:00+05:30');
      const profile = buildTemporalProfile(place, {
        referenceDate,
        stepMin: 240, // coarse step keeps the point count small for test speed
        horizonMin: 999999,
      });
      expect(profile.horizonHours).toBeLessThanOrEqual(72);
    });

    test('accepts a string referenceDate and a weather payload without throwing', () => {
      const profile = buildTemporalProfile(place, {
        referenceDate: '2026-08-16T09:00:00+05:30',
        stepMin: 120,
        horizonMin: 240,
        weather: { hourly: [{ time: '2026-08-16T09:00:00+05:30', suitability: 'good' }] },
      });
      expect(profile.points.length).toBeGreaterThan(0);
    });
  });
});
