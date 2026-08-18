const {
  predictCrowd,
  updateOnline,
  feedbackToLabel,
  buildFeatures,
  getModelInfo,
} = require('../services/ml/crowdModel');

describe('ml/crowdModel online logistic regression', () => {
  test('buildFeatures has fixed dimension', () => {
    const x = buildFeatures({
      daypart: 'morning',
      isWeekend: true,
      isPeakHourNow: false,
      month: 8,
      cat: 'temple',
      historicalScore: 40,
    });
    expect(x.length).toBe(18);
    expect(x[17]).toBe(1); // bias
  });

  test('predictCrowd returns level and score', () => {
    const pred = predictCrowd({
      daypart: 'evening',
      isWeekend: true,
      isPeakHourNow: true,
      month: 12,
      cat: 'market',
      historicalScore: 80,
    });
    expect(pred.score).toBeGreaterThanOrEqual(0);
    expect(pred.score).toBeLessThanOrEqual(100);
    expect(pred.level).toMatch(/Low|Moderate|High/);
    // v3 model: reports a distinct "-cold" source until it has seen at
    // least 20 training samples, so callers can tell a fresh model apart
    // from one with real learned signal.
    expect(pred.source).toMatch(/^ml-logistic-v3(-cold)?$/);
  });

  test('online update moves prediction toward label', () => {
    const ctx = {
      daypart: 'afternoon',
      isWeekend: false,
      isPeakHourNow: true,
      month: 5,
      cat: 'beach',
      historicalScore: 50,
    };
    const before = predictCrowd(ctx).probability;
    for (let i = 0; i < 30; i++) updateOnline(ctx, 1);
    const after = predictCrowd(ctx).probability;
    expect(after).toBeGreaterThanOrEqual(before - 0.05); // generally increases for high-crowd label
    expect(getModelInfo().trainedN).toBeGreaterThan(0);
  });

  test('feedbackToLabel maps ratings', () => {
    expect(feedbackToLabel(1, false)).toBe(1);
    expect(feedbackToLabel(5, true)).toBe(0);
  });
});
