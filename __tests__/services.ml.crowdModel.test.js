'use strict';

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

  test('predictCrowd returns baseline and truthful provenance on cold start', () => {
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
    expect(pred.level).toMatch(/Low|Moderate|High|Very High/);
    expect(pred.isMlActive).toBe(false);
    expect(pred.source).toMatch(/^(historical_baseline|rule_baseline|ml-logistic-v3)$/);
  });

  test('online update activates ML prediction after meeting minimum sample threshold', () => {
    const ctx = {
      daypart: 'afternoon',
      isWeekend: false,
      isPeakHourNow: true,
      month: 5,
      cat: 'beach',
      historicalScore: 50,
    };
    for (let i = 0; i < 30; i++) updateOnline(ctx, 1);
    const after = predictCrowd(ctx);
    expect(after.isMlActive).toBe(true);
    expect(after.source).toBe('ml-logistic-v3');
    expect(after.probability).toBeGreaterThanOrEqual(0.45);
    expect(getModelInfo().trainedN).toBeGreaterThanOrEqual(30);
  });

  test('feedbackToLabel maps ratings and explicit crowd reports', () => {
    expect(feedbackToLabel(1, false)).toBe(1);
    expect(feedbackToLabel(5, true)).toBe(0);
    expect(feedbackToLabel(null, true, { crowdScore: 75 })).toBe(0.75);
    expect(feedbackToLabel(null, true, { crowdLevel: 'High' })).toBe(0.75);
  });
});
