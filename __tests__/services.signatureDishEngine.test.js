// __tests__/services.signatureDishEngine.test.js
'use strict';

const { getSignatureDish } = require('../services/travelIntelligence/signatureDishEngine');

describe('signatureDishEngine', () => {
  test('returns iconic Irani Chai and Osmania Biscuits for Charminar', () => {
    const dish = getSignatureDish({ name: 'Charminar', cat: 'scenic' }, 'hyderabad');
    expect(dish).toBeTruthy();
    expect(dish.dishName).toContain('Irani Chai');
    expect(dish.iconicSpot).toContain('Nimrah Cafe');
    expect(dish.distanceM).toBeLessThanOrEqual(50);
    expect(dish.mustTryReason).toBeTruthy();
  });

  test('returns Muri Mixture & Bajji for Ramakrishna Beach Vizag', () => {
    const dish = getSignatureDish({ name: 'Ramakrishna Beach', cat: 'beach' }, 'visakhapatnam');
    expect(dish).toBeTruthy();
    expect(dish.dishName).toContain('Muri Mixture');
    expect(dish.isVeg).toBe(true);
    expect(dish.priceRange).toBeTruthy();
  });

  test('returns Dal Baati Churma for Amber Fort Jaipur', () => {
    const dish = getSignatureDish({ name: 'Amber Fort', cat: 'scenic' }, 'jaipur');
    expect(dish).toBeTruthy();
    expect(dish.dishName).toContain('Dal Baati Churma');
  });

  test('returns generic temple prasadam fallback for unlisted temple', () => {
    const dish = getSignatureDish({ name: 'Local Hill Shrine', cat: 'temple' }, 'random');
    expect(dish).toBeTruthy();
    expect(dish.dishName).toContain('Prasadam');
    expect(dish.matchedBy).toBe('category_fallback');
  });

  test('returns generic city fallback when place not explicitly registered', () => {
    const dish = getSignatureDish({ name: 'Random Tech Park', cat: 'scenic' }, 'hyderabad');
    expect(dish).toBeTruthy();
    expect(dish.dishName).toContain('Irani Chai');
    expect(dish.matchedBy).toBe('city_fallback');
  });
});
