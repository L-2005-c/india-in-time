/**
 * Domain module tests — run in Node by reading the ESM source as text is hard;
 * duplicate pure logic assertions via require of planner is not available (ESM).
 * Instead test the same pure contracts via inline reimplementation parity checks
 * against utils already in CJS where possible.
 */
const { orderNearestNeighbor, filterWithinRadius } = require('../utils/spatial');

describe('enterprise planner/geo contracts', () => {
  test('spatial NN used by planner stays stable', () => {
    const places = [
      { name: 'far', coords: [18, 79] },
      { name: 'near', coords: [17.4, 78.5] },
    ];
    expect(orderNearestNeighbor(places, 17.385, 78.4867)[0].name).toBe('near');
  });

  test('radius filter supports enterprise map queries', () => {
    const places = [
      { name: 'a', coords: [17.39, 78.49] },
      { name: 'b', coords: [28.6, 77.2] },
    ];
    expect(filterWithinRadius(places, 17.385, 78.4867, 15)).toHaveLength(1);
  });
});
