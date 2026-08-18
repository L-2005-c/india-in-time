const {
  haversineKm,
  bboxAround,
  pointInBbox,
  filterWithinRadius,
  bearingDegrees,
  gridCellId,
  orderNearestNeighbor,
} = require('../utils/spatial');

describe('utils/spatial', () => {
  test('haversineKm roughly matches known Delhi–Agra distance', () => {
    const km = haversineKm(28.6139, 77.209, 27.1767, 78.0081);
    expect(km).toBeGreaterThan(170);
    expect(km).toBeLessThan(220);
  });

  test('bboxAround + pointInBbox', () => {
    const bbox = bboxAround(17.385, 78.4867, 5);
    expect(pointInBbox(17.385, 78.4867, bbox)).toBe(true);
    expect(pointInBbox(0, 0, bbox)).toBe(false);
  });

  test('filterWithinRadius', () => {
    const places = [
      { name: 'near', coords: [17.39, 78.49] },
      { name: 'far', coords: [28.6, 77.2] },
    ];
    const near = filterWithinRadius(places, 17.385, 78.4867, 20);
    expect(near.map((p) => p.name)).toEqual(['near']);
  });

  test('bearingDegrees returns 0–360', () => {
    const b = bearingDegrees(17.385, 78.4867, 17.5, 78.5);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  test('gridCellId stable', () => {
    expect(gridCellId(17.385, 78.4867, 2)).toBe(gridCellId(17.385, 78.4867, 2));
  });

  test('orderNearestNeighbor starts at origin', () => {
    const places = [
      { name: 'b', coords: [17.5, 78.5] },
      { name: 'a', coords: [17.39, 78.49] },
    ];
    const ordered = orderNearestNeighbor(places, 17.385, 78.4867);
    expect(ordered[0].name).toBe('a');
  });
});
