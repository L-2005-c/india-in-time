const { buildWindows, selectModes, confidenceSummary } = require('../services/travelIntelligence/temporalEngine');

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

  test('selects tomorrow independently from current-day later windows', () => {
    const reference = new Date('2026-08-16T10:00:00+05:30');
    const windows = [
      { dayKey: '2026-08-16', dayOffset: 0, startMin: 720, endMin: 780, score: 70, reasons: [] },
      { dayKey: '2026-08-17', dayOffset: 1, startMin: 1080, endMin: 1140, score: 95, reasons: ['sunset'] },
    ];
    expect(selectModes(windows, reference).BEST_TOMORROW.score).toBe(95);
  });

  test('confidence summary exposes evidence gaps rather than fabricating certainty', () => {
    const result = confidenceSummary([{ confidence: 42, weatherSource: 'unavailable', crowdSource: 'unavailable', trafficSource: 'unavailable' }]);
    expect(result.level).toBe('LOW');
    expect(result.reasons.join(' ')).toMatch(/weather|crowd|routing/i);
  });
});
