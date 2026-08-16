'use strict';
const { generateExperienceWindows } = require('../services/travelIntelligence/experienceWindows');

describe('experience windows', () => {
  test('evaluates explicit time windows deterministically', () => {
    const result = generateExperienceWindows({
      referenceDate: new Date('2026-08-16T10:00:00+05:30'),
      referenceStartMin: 600,
      currentMin: 600,
      startMin: 600,
      endMin: 900,
      stepMin: 60,
      evaluate: (_at, _weather, minute) => ({
        visitScore: minute === 780 ? 94 : 55,
        confidence: 80,
        scenic: { reasons: minute === 780 ? ['golden hour'] : [] },
        weather: { source: 'forecast' },
        traffic: { source: 'route_estimate' },
        crowd: { reason: 'predicted pattern' },
        opening: { status: 'OPEN' },
      }),
    });
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.modes.BEST_PHOTOGRAPHY_WINDOW).toBeTruthy();
    expect(result.windows[0].score).toBe(94);
  });

  test('does not fabricate a window when no evaluator exists', () => {
    expect(generateExperienceWindows({}).windows).toEqual([]);
  });
});
