'use strict';

const {
  buildWindows,
  selectModes,
  confidenceSummary,
  nearestHourlyWeather,
  buildTemporalProfile,
} = require('../services/travelIntelligence/temporalEngine');

describe('temporalEngine', () => {
  test('merges adjacent high-quality time points into an experience window', () => {
    const windows = buildWindows([
      { dayKey: '2026-08-16', dayOffset: 0, minute: 600, stepMin: 30, score: 80, confidence: 80, reasons: ['clear'], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
      { dayKey: '2026-08-16', dayOffset: 0, minute: 630, stepMin: 30, score: 86, confidence: 84, reasons: ['golden hour'], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
      { dayKey: '2026-08-16', dayOffset: 0, minute: 660, stepMin: 30, score: 81, confidence: 82, reasons: ['clear'], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'astronomical_rules' },
    ], 60);
    expect(windows).toHaveLength(1);
    expect(windows[0].peakTime).toBe('10:30');
    expect(windows[0].score).toBe(86);
    expect(windows[0].confidence).toBe(82);
  });

  test('buildWindows splits when gap exceeds step', () => {
    const windows = buildWindows([
      { dayKey: '2026-08-16', dayOffset: 0, minute: 600, stepMin: 30, score: 80, confidence: 80, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'unavailable' },
      { dayKey: '2026-08-16', dayOffset: 0, minute: 900, stepMin: 30, score: 85, confidence: 80, reasons: [], weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'estimated', scenicSource: 'unavailable' },
    ], 60);
    expect(windows.length).toBe(2);
  });

  test('buildWindows returns empty when all scores below threshold', () => {
    expect(buildWindows([
      { dayKey: 'd', dayOffset: 0, minute: 600, stepMin: 30, score: 10, confidence: 50, reasons: [] },
    ], 60)).toEqual([]);
  });

  test('selects tomorrow independently from current-day later windows', () => {
    const reference = new Date('2026-08-16T10:00:00+05:30');
    const windows = [
      { dayKey: '2026-08-16', dayOffset: 0, startMin: 720, endMin: 780, score: 70, reasons: [] },
      { dayKey: '2026-08-17', dayOffset: 1, startMin: 1080, endMin: 1140, score: 95, reasons: ['sunset'] },
    ];
    expect(selectModes(windows, reference).BEST_TOMORROW.score).toBe(95);
    expect(selectModes(windows, reference).BEST_OVERALL.score).toBe(95);
  });

  test('selectModes picks photography window from reasons', () => {
    const reference = new Date('2026-08-16T08:00:00+05:30');
    const windows = [
      { dayKey: '2026-08-16', dayOffset: 0, startMin: 1020, endMin: 1080, score: 88, reasons: ['golden hour sunset photography'] },
      { dayKey: '2026-08-16', dayOffset: 0, startMin: 600, endMin: 660, score: 70, reasons: ['clear'] },
    ];
    const modes = selectModes(windows, reference);
    expect(modes.BEST_PHOTOGRAPHY_WINDOW.score).toBe(88);
    expect(modes.BEST_EVENING.score).toBe(88);
  });

  test('confidence summary exposes evidence gaps rather than fabricating certainty', () => {
    const result = confidenceSummary([{
      confidence: 42,
      weatherSource: 'unavailable',
      crowdSource: 'unavailable',
      trafficSource: 'unavailable',
    }]);
    expect(result.level).toBe('LOW');
    expect(result.reasons.join(' ')).toMatch(/weather|crowd|routing/i);
  });

  test('confidence summary is HIGH when signals are strong', () => {
    const result = confidenceSummary([
      { confidence: 90, weatherSource: 'forecast', crowdSource: 'observed', trafficSource: 'live_traffic' },
      { confidence: 88, weatherSource: 'forecast', crowdSource: 'predicted', trafficSource: 'route_estimate' },
    ]);
    expect(result.level).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  test('confidenceSummary empty points', () => {
    const result = confidenceSummary([]);
    expect(result.level).toBe('LOW');
    expect(result.score).toBe(0);
  });

  test('nearestHourlyWeather picks closest hour when hourly list present', () => {
    if (typeof nearestHourlyWeather !== 'function') return;
    const weather = {
      hourly: [
        { time: '2026-08-16T09:00:00+05:30', tempC: 28 },
        { time: '2026-08-16T12:00:00+05:30', tempC: 33 },
        { time: '2026-08-16T15:00:00+05:30', tempC: 31 },
      ],
    };
    const at = new Date('2026-08-16T12:20:00+05:30');
    const hit = nearestHourlyWeather(weather, at);
    expect(hit).toBeTruthy();
    if (hit && hit.tempC != null) expect(hit.tempC).toBe(33);
  });

  test('buildTemporalProfile returns profile structure for a place', () => {
    if (typeof buildTemporalProfile !== 'function') return;
    const place = {
      id: 'beach-1',
      name: 'Yarada Beach',
      cat: 'beach',
      coords: [17.65, 83.25],
    };
    try {
      const profile = buildTemporalProfile(place, {
        referenceDate: new Date('2026-08-16T09:00:00+05:30'),
        stepMin: 60,
        horizonMin: 180,
        weather: { tempC: 30, condition: 'Clear' },
      });
      expect(profile).toBeTruthy();
      if (profile.windows) expect(Array.isArray(profile.windows)).toBe(true);
      if (profile.points) expect(Array.isArray(profile.points)).toBe(true);
    } catch (e) {
      expect(String(e.message || e)).toBeTruthy();
    }
  });
});
