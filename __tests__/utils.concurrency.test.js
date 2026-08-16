const { mapWithConcurrency } = require('../utils/concurrency');

describe('mapWithConcurrency', () => {
  test('preserves order while bounding active workers', async () => {
    let active = 0;
    let maxActive = 0;
    const out = await mapWithConcurrency([1,2,3,4,5], 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2,4,6,8,10]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
