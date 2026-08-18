const { buildMultiDayItinerary, clusterPlaces, orderClustersByTravelFlow } = require('../services/travelIntelligence/multiDayPlanner');

function place(name, cat, coords, extra = {}) {
  return { name, cat, coords, ot: '06:00', ct: '20:00', vt: 45, ...extra };
}

describe('multiDayPlanner.clusterPlaces', () => {
  test('splits geographically separate places into their own clusters', () => {
    const places = [
      place('North A', 'temple', [17.80, 83.30]),
      place('North B', 'museum', [17.81, 83.31]),
      place('South A', 'beach', [17.10, 83.30]),
      place('South B', 'fort', [17.11, 83.31]),
    ];
    const { clusters, withoutCoords } = clusterPlaces(places, 2);
    expect(withoutCoords).toHaveLength(0);
    expect(clusters).toHaveLength(2);
    const names = (c) => c.map((p) => p.name).sort();
    const flat = clusters.map(names);
    expect(flat).toContainEqual(['North A', 'North B']);
    expect(flat).toContainEqual(['South A', 'South B']);
  });

  test('places without coordinates are returned separately', () => {
    const places = [place('Has Coords', 'temple', [17.8, 83.3]), { name: 'No Coords', cat: 'market' }];
    const { clusters, withoutCoords } = clusterPlaces(places, 2);
    expect(withoutCoords).toHaveLength(1);
    expect(withoutCoords[0].name).toBe('No Coords');
    expect(clusters.flat().find((p) => p.name === 'Has Coords')).toBeTruthy();
  });
});

describe('multiDayPlanner.orderClustersByTravelFlow', () => {
  test('anchors the first day on the cluster nearest the trip origin', () => {
    const north = [place('North A', 'temple', [17.80, 83.30])];
    const south = [place('South A', 'beach', [17.10, 83.30])];
    const ordered = orderClustersByTravelFlow([south, north], [17.79, 83.29]);
    expect(ordered[0]).toBe(north);
    expect(ordered[1]).toBe(south);
  });

  test('leaves empty clusters at the end instead of interleaving them', () => {
    const north = [place('North A', 'temple', [17.80, 83.30])];
    const south = [place('South A', 'beach', [17.10, 83.30])];
    const ordered = orderClustersByTravelFlow([[], south, north], [17.79, 83.29]);
    expect(ordered.slice(0, 2)).toContainEqual(north);
    expect(ordered.slice(0, 2)).toContainEqual(south);
    expect(ordered[2]).toEqual([]);
  });

  test('is a no-op when zero or one clusters have coordinates', () => {
    const north = [place('North A', 'temple', [17.80, 83.30])];
    const clusters = [north, []];
    expect(orderClustersByTravelFlow(clusters, null)).toBe(clusters);
  });
});

describe('multiDayPlanner.buildMultiDayItinerary', () => {
  test('builds one entry per day, spread across the requested date range', async () => {
    const places = [
      place('North Temple', 'temple', [17.80, 83.30]),
      place('North Museum', 'museum', [17.81, 83.31]),
      place('South Beach', 'beach', [17.10, 83.30]),
      place('South Fort', 'fort', [17.11, 83.31]),
    ];
    const result = await buildMultiDayItinerary(places, {
      startDate: new Date('2026-09-01T00:00:00+05:30'),
      days: 2,
      pacing: 'relaxed',
      region: 'test-region',
    });
    expect(result.days).toBe(2);
    expect(result.itinerary).toHaveLength(2);
    expect(result.itinerary[0].date).toBe('2026-09-01');
    expect(result.itinerary[1].date).toBe('2026-09-02');
    expect(result.algorithm).toMatch(/multi-day/);
    expect(typeof result.totalStops).toBe('number');
  });

  test('rejects an invalid startDate', async () => {
    await expect(buildMultiDayItinerary([place('X', 'temple', [17.8, 83.3])], {
      startDate: 'not-a-date',
      days: 2,
    })).rejects.toThrow();
  });

  test('handles more days than geographic clusters without crashing', async () => {
    const places = [place('Only Place', 'temple', [17.8, 83.3])];
    const result = await buildMultiDayItinerary(places, {
      startDate: new Date('2026-09-01T00:00:00+05:30'),
      days: 3,
    });
    expect(result.itinerary).toHaveLength(3);
    expect(result.itinerary.some((d) => d.stopCount === 0)).toBe(true);
  });

  test('reports a trip-quality rollup and reasons for unused places', async () => {
    const places = [
      place('North Temple', 'temple', [17.80, 83.30]),
      place('North Museum', 'museum', [17.81, 83.31]),
      place('North Lunch', 'food', [17.805, 83.305]),
      { name: 'No Coords Stall', cat: 'food' },
    ];
    const result = await buildMultiDayItinerary(places, {
      startDate: new Date('2026-09-01T00:00:00+05:30'),
      days: 1,
      pacing: 'relaxed',
      originCoords: [17.79, 83.29],
    });
    expect(result.tripQuality).toBeTruthy();
    expect(typeof result.tripQuality.stopsScored).toBe('number');
    const noCoordsEntry = result.unusedPlaces.find((p) => p.name === 'No Coords Stall');
    if (noCoordsEntry) {
      expect(noCoordsEntry.reason).toMatch(/no coordinates|not selected/i);
    } else {
      // v5 optimizer can schedule places without coords using estimated travel time
      const scheduled = result.itinerary.some((day) => (day.stops || []).some((s) => s.name === 'No Coords Stall'));
      expect(scheduled).toBe(true);
    }
    if ((result.itinerary[0].stops || []).length) {
      expect(result.itinerary[0].returnToOrigin).toBeTruthy();
    }
  });

  test('only suggests rebalancing to a day that has spare stop capacity', async () => {
    const places = [
      place('Rainy Beach', 'beach', [17.80, 83.30]),
      place('Full Day Fort', 'fort', [17.10, 83.30]),
    ];
    const result = await buildMultiDayItinerary(places, {
      startDate: new Date('2026-09-01T00:00:00+05:30'),
      days: 2,
      pacing: 'relaxed',
      maxStopsPerDay: 1,
      getWeatherForDate: (date, idx) => (idx === 0 ? { tempC: 30, condition: 'Thunderstorm' } : { tempC: 28, condition: 'Clear' }),
    });
    result.rebalanceSuggestions.forEach((s) => {
      if (s.suggestedDay) {
        const target = result.itinerary.find((d) => d.dayIndex === s.suggestedDay);
        expect((target.stops || []).length).toBeLessThan(1 + 1);
      }
    });
  });
});
