const { timeIntelLimiter, aiLimiter, placesLimiter } = require('../middleware/rateLimiter');

describe('timeIntelLimiter export', () => {
  test('exports timeIntelLimiter middleware', () => {
    expect(typeof timeIntelLimiter).toBe('function');
    expect(typeof aiLimiter).toBe('function');
    expect(typeof placesLimiter).toBe('function');
  });
});
