// __tests__/services.timeIntelligence.core.test.js
// services/timeIntelligence.js was at 11.6% coverage — only personalizeScore
// (tested in services.timeIntelligence.test.js) had real coverage. This
// covers the actual core: getPlaceState (open/closed determination, badges,
// notifications, weather overrides), computeSunTimes, getDaypart, t2m/m2t,
// predictCrowd, and suggestOpenAlternatives.
//
// All "now" values are constructed as explicit IST wall-clock times via the
// `+05:30` offset so tests are deterministic regardless of the machine's
// local timezone (the module itself reads via Asia/Kolkata specifically to
// avoid this exact class of bug on a UTC server — see its own header
// comment — so tests need the same discipline).

const {
  getPlaceState, getBatchState, predictCrowd, computeSunTimes,
  suggestOpenAlternatives, t2m, m2t,
} = require('../services/timeIntelligence');

function ist(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
}

const JAIPUR = [26.9124, 75.7873];

describe('t2m / m2t — time <-> minutes conversion', () => {
  test('t2m parses HH:MM into minutes-of-day', () => {
    expect(t2m('09:30')).toBe(570);
    expect(t2m('00:00')).toBe(0);
    expect(t2m('23:59')).toBe(1439);
  });

  test('t2m returns the fallback for missing/malformed input', () => {
    expect(t2m(null, 42)).toBe(42);
    expect(t2m('garbage', 42)).toBe(42);
    expect(t2m(undefined)).toBe(0); // default fallback
  });

  test('m2t formats minutes back into zero-padded HH:MM, wrapping negative/overflow values', () => {
    expect(m2t(570)).toBe('09:30');
    expect(m2t(0)).toBe('00:00');
    expect(m2t(1440)).toBe('00:00');   // wraps to next day
    expect(m2t(-30)).toBe('23:30');    // wraps backward
  });
});

describe('computeSunTimes', () => {
  test('returns plausible sunrise/sunset times for a real Indian city/date', () => {
    const { sunrise, sunset } = computeSunTimes(JAIPUR[0], JAIPUR[1], ist('2026-06-15', '12:00'));
    // June in Jaipur: sunrise roughly 05:30-06:00, sunset roughly 19:00-19:30 IST
    expect(t2m(sunrise)).toBeGreaterThan(t2m('05:00'));
    expect(t2m(sunrise)).toBeLessThan(t2m('06:30'));
    expect(t2m(sunset)).toBeGreaterThan(t2m('18:30'));
    expect(t2m(sunset)).toBeLessThan(t2m('20:00'));
  });

  test('falls back to 06:00/18:30 on invalid input rather than throwing', () => {
    const result = computeSunTimes(NaN, NaN, 'not-a-date');
    expect(result).toEqual({ sunrise: '06:00', sunset: '18:30' });
  });
});

describe('getPlaceState — open/closed determination', () => {
  const fort = { name: 'Amber Fort', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR };

  test('isOpenNow is true within stated hours', () => {
    const state = getPlaceState(fort, ist('2026-01-15', '11:00'));
    expect(state.isOpenNow).toBe(true);
    expect(state.badges).toContain('🟢 Open');
  });

  test('isOpenNow is false before opening / after closing', () => {
    expect(getPlaceState(fort, ist('2026-01-15', '07:00')).isOpenNow).toBe(false);
    expect(getPlaceState(fort, ist('2026-01-15', '19:00')).isOpenNow).toBe(false);
  });

  test('a place with night_availability stays open past normal closing hours', () => {
    const nightMarket = { name: 'Night Bazaar', cat: 'market', ot: '10:00', ct: '20:00', night_availability: true, coords: JAIPUR };
    const state = getPlaceState(nightMarket, ist('2026-01-15', '22:00'));
    expect(state.isOpenNow).toBe(true);
    expect(state.statusLabel).toBe('Open at night');
  });

  test('weeklyHoliday closes the place all day regardless of hours, with the day name in the label', () => {
    const museum = { name: 'City Museum', cat: 'scenic', ot: '09:00', ct: '17:00', weeklyHoliday: 'Monday', coords: JAIPUR };
    // 2026-01-19 is a Monday
    const state = getPlaceState(museum, ist('2026-01-19', '11:00'));
    expect(state.isOpenNow).toBe(false);
    expect(state.statusLabel).toContain('weekly holiday: Monday');
    expect(state.minutesToOpen).toBeNull(); // don't suggest "opens in X" on a holiday
  });

  test('minutesToClose counts down correctly, and adds the "closing soon" badge under 45 minutes', () => {
    const state = getPlaceState(fort, ist('2026-01-15', '16:30')); // 30 min before 17:00 close
    expect(state.minutesToClose).toBe(30);
    expect(state.badges).toContain('🟡 Closing Soon');
  });

  test('sunrise spot gets a specific recommendation during early morning', () => {
    const viewpoint = { name: 'Nahargarh Viewpoint', cat: 'scenic', ot: '05:00', ct: '20:00', is_sunrise_spot: true, coords: JAIPUR };
    const state = getPlaceState(viewpoint, ist('2026-01-15', '06:00'));
    expect(state.daypart).toBe('earlyMorning');
    expect(state.recommendations.some(r => r.includes('Sunrise viewpoint'))).toBe(true);
    expect(state.badges).toContain('🌅 Best at Sunrise');
  });

  test('outdoor place in extreme afternoon heat gets a heat warning and indoor recommendation', () => {
    const outdoorFort = { name: 'Amber Fort', cat: 'scenic', ot: '09:00', ct: '17:00', indoor_outdoor: 'outdoor', coords: JAIPUR };
    const state = getPlaceState(outdoorFort, ist('2026-01-15', '14:00'), { tempC: 39 });
    expect(state.statusLabel).toContain('Hot outside');
    expect(state.badges).toContain('🔥 Hot Weather');
  });

  test('rain in the weather forecast adds a rain warning and badge', () => {
    const state = getPlaceState(fort, ist('2026-01-15', '11:00'), { condition: 'Light rain' });
    expect(state.weatherWarnings.some(w => w.includes('Rain'))).toBe(true);
    expect(state.badges).toContain('🌧 Rain Alert');
  });

  test('strong wind only warns for beach/sunset-spot categories, not an indoor museum', () => {
    const beach = { name: 'Baga Beach', cat: 'beach', ot: '06:00', ct: '20:00', coords: [15.3, 74.1] };
    const museum = { name: 'City Museum', cat: 'museum', ot: '09:00', ct: '17:00', coords: JAIPUR };
    const beachState = getPlaceState(beach, ist('2026-01-15', '11:00'), { windKph: 40 });
    const museumState = getPlaceState(museum, ist('2026-01-15', '11:00'), { windKph: 40 });
    expect(beachState.weatherWarnings.some(w => w.includes('winds'))).toBe(true);
    expect(museumState.weatherWarnings.some(w => w.includes('winds'))).toBe(false);
  });

  test('notifies when closing within the next hour', () => {
    const state = getPlaceState(fort, ist('2026-01-15', '16:15')); // 45 min to close
    expect(state.notifications.some(n => n.includes('closes in 45 minutes'))).toBe(true);
  });

  test('notifies of opening time (with tomorrow\'s sunrise) when currently closed and not a holiday', () => {
    const state = getPlaceState(fort, ist('2026-01-15', '20:00')); // closed, opens 09:00 next day
    expect(state.notifications.some(n => n.includes('Opens in'))).toBe(true);
  });
});

describe('predictCrowd', () => {
  test('weekday early morning is Very Low or Low', () => {
    const crowd = predictCrowd({ daypart: 'earlyMorning', isWeekend: false, isPeakHourNow: false, cat: 'scenic' });
    expect(['Very Low', 'Low']).toContain(crowd);
  });

  test('weekend + peak hour + market category compounds toward High/Very High', () => {
    const crowd = predictCrowd({ daypart: 'evening', isWeekend: true, isPeakHourNow: true, cat: 'market' });
    expect(['High', 'Very High']).toContain(crowd);
  });

  test('is a monotonic function of its stacking multipliers (weekend+peak strictly >= plain weekday off-peak)', () => {
    const order = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];
    const base = predictCrowd({ daypart: 'afternoon', isWeekend: false, isPeakHourNow: false, cat: 'scenic' });
    const boosted = predictCrowd({ daypart: 'afternoon', isWeekend: true, isPeakHourNow: true, cat: 'scenic' });
    expect(order.indexOf(boosted)).toBeGreaterThanOrEqual(order.indexOf(base));
  });
});

describe('getBatchState', () => {
  test('maps getPlaceState over every place in the list', () => {
    const places = [
      { name: 'A', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR },
      { name: 'B', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR },
    ];
    const result = getBatchState(places, ist('2026-01-15', '11:00'));
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('A');
    expect(result[1].name).toBe('B');
  });

  test('handles an empty/undefined list without throwing', () => {
    expect(getBatchState(undefined)).toEqual([]);
    expect(getBatchState([])).toEqual([]);
  });
});

describe('suggestOpenAlternatives', () => {
  const now = ist('2026-01-15', '20:00'); // after most daytime-only places close

  test('suggests same-category places that are currently open, excluding the closed place itself', () => {
    const closed = { name: 'Amber Fort', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR };
    const allPlaces = [
      closed,
      { name: 'Nahargarh Fort (night)', cat: 'scenic', ot: '09:00', ct: '22:00', night_availability: true, coords: JAIPUR },
      { name: 'Some Beach', cat: 'beach', ot: '00:00', ct: '23:59', coords: JAIPUR }, // different category — excluded
    ];
    const result = suggestOpenAlternatives(closed, allPlaces, now);
    expect(result).toContain('Nahargarh Fort (night)');
    expect(result).not.toContain('Amber Fort');
    expect(result).not.toContain('Some Beach');
  });

  test('respects the limit parameter', () => {
    const closed = { name: 'X', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR };
    const allPlaces = Array.from({ length: 10 }, (_, i) => ({
      name: `Open Place ${i}`, cat: 'scenic', ot: '00:00', ct: '23:59', coords: JAIPUR,
    }));
    const result = suggestOpenAlternatives(closed, allPlaces, now, null, 2);
    expect(result).toHaveLength(2);
  });

  test('returns an empty array when nothing else in that category is open', () => {
    const closed = { name: 'X', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR };
    const alsoClosed = { name: 'Y', cat: 'scenic', ot: '09:00', ct: '17:00', coords: JAIPUR };
    expect(suggestOpenAlternatives(closed, [closed, alsoClosed], now)).toEqual([]);
  });
});
