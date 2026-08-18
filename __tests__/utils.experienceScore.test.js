'use strict';
const { calculateExperienceScorePure, getOpeningStatusPure, timeToMinutes } = require('../utils/experienceScore');
describe('experienceScore', () => {
  test('parse', () => expect(timeToMinutes('10:30')).toBe(630));
  test('closed', () => expect(getOpeningStatusPure({ ot: '09:00', ct: '17:00' }, 20 * 60).status).toBe('closed'));
  test('score open', () => {
    const r = calculateExperienceScorePure({ ot: '08:00', ct: '20:00', is_sunset_spot: true }, 17 * 60, { sunsetMin: 18 * 60 });
    expect(r.score).toBeGreaterThan(50);
  });
});
