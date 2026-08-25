'use strict';

const {
  calculateBearing,
  evaluateBacktrackingPenalty,
  buildGeographicClusters,
  getNearbyRecommendations,
} = require('../services/travelIntelligence/proximityGraph');

describe('Smart Proximity & Spatial Clustering (proximityGraph.js)', () => {
  test('calculates accurate directional bearings', () => {
    // Due North
    const north = calculateBearing(17.0, 83.0, 18.0, 83.0);
    expect(north).toBeCloseTo(0, 0);

    // Due East
    const east = calculateBearing(17.0, 83.0, 17.0, 84.0);
    expect(east).toBeCloseTo(90, 0);

    // Due South
    const south = calculateBearing(18.0, 83.0, 17.0, 83.0);
    expect(south).toBeCloseTo(180, 0);
  });

  test('penalizes severe 180-degree backtracking', () => {
    const p1 = [17.7126, 83.3235]; // RK Beach
    const p2 = [17.7478, 83.3364]; // Kailasagiri (North)
    const p3 = [17.7100, 83.3200]; // Submarine Museum (South, right back near p1)

    // Moving North then directly reversing South
    const penalty = evaluateBacktrackingPenalty(p1, p2, p3);
    expect(penalty).toBeGreaterThan(0);

    // Moving progressively further North (e.g. to Rushikonda Beach [17.7816, 83.3857])
    const pRushikonda = [17.7816, 83.3857];
    const noPenalty = evaluateBacktrackingPenalty(p1, p2, pRushikonda);
    expect(noPenalty).toBe(0);
  });

  test('groups places into geographic clusters', () => {
    const places = [
      { name: 'RK Beach', coords: [17.7126, 83.3235] },
      { name: 'Submarine Museum', coords: [17.7165, 83.3323] },
      { name: 'Kailasagiri', coords: [17.7478, 83.3364] },
      { name: 'Rushikonda Beach', coords: [17.7816, 83.3857] },
    ];

    const clusters = buildGeographicClusters(places, 3.0);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters[0].places.some(p => p.name === 'RK Beach')).toBe(true);
  });

  test('generates valid Nearby After This recommendations with Google Maps URLs', () => {
    const current = { name: 'RK Beach', coords: [17.7126, 83.3235] };
    const pool = [
      { id: 'sub', name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323], rating: 4.6 },
      { id: 'kai', name: 'Kailasagiri', cat: 'scenic', coords: [17.7478, 83.3364], rating: 4.8 },
      { id: 'rushi', name: 'Rushikonda Beach', cat: 'beach', coords: [17.7816, 83.3857], rating: 4.7 },
      { id: 'far', name: 'Araku Valley', cat: 'scenic', coords: [18.3273, 82.8775], rating: 4.8 }, // > 80 km away
    ];

    const nearby = getNearbyRecommendations(current, pool);
    expect(nearby.length).toBeGreaterThanOrEqual(2);
    expect(nearby.every(n => n.name !== 'Araku Valley')).toBe(true); // Excludes far destinations
    expect(nearby[0].googleMapsUrl).toContain('origin=17.7126,83.3235');
    expect(nearby[0].distanceKm).toBeGreaterThan(0);
  });
});
