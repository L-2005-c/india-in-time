const { getTravelIntelligence, rankPlacesForDay, buildDayPlan, dynamicAdvice, computeSunTimes } = require('../services/travelIntelligence');
const { computeCrowd } = require('../services/travelIntelligence/crowdEngine');
const { estimateTravel, recommendArrivalWindow } = require('../services/travelIntelligence/trafficEngine');
const { computeWeatherIntelligence } = require('../services/travelIntelligence/weatherEngine');
const { computeVisitScore, openingToScore } = require('../services/travelIntelligence/scoringEngine');
const { computeConfidence } = require('../services/travelIntelligence/confidenceEngine');

function ist(d, t) { return new Date(`${d}T${t}:00+05:30`); }
const JAIPUR = [26.9124, 75.7873];
const fort = { name: 'Amber Fort', cat: 'fort', ot: '09:00', ct: '17:00', coords: JAIPUR, is_sunset_spot: true, indoor_outdoor: 'outdoor' };

describe('crowdEngine', () => {
  test('structured estimate with source', () => {
    const c = computeCrowd({ daypart: 'earlyMorning', isWeekend: false, isPeakHourNow: false, cat: 'scenic' });
    expect(c.level).toMatch(/Low|Very Low/);
    expect(c.source).toBe('estimated');
  });
});

describe('trafficEngine', () => {
  test('estimated travel labelled', () => {
    const t = estimateTravel({ fromCoords: [26.91, 75.78], toCoords: [26.92, 75.79], departMin: 540 });
    expect(t.source).toBe('estimated');
    expect(t.travelMinutes).toBeGreaterThan(0);
  });
  test('live traffic preferred', () => {
    const t = estimateTravel({ fromCoords: [26.91, 75.78], toCoords: [26.92, 75.79], departMin: 540, liveTraffic: { durationSec: 1200, distanceM: 8000 } });
    expect(t.source).toBe('live');
    expect(t.travelMinutes).toBe(20);
  });
  test('arrival window', () => {
    const a = recommendArrivalWindow({ experienceStartMin: 17 * 60, travelMinutes: 35, bufferMin: 15 });
    expect(a.recommendedDeparture).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('weatherEngine', () => {
  test('missing weather unavailable', () => {
    expect(computeWeatherIntelligence(null, {}).source).toBe('unavailable');
  });
  test('heat penalizes outdoor', () => {
    const w = computeWeatherIntelligence({ tempC: 40 }, { cat: 'fort', indoor_outdoor: 'outdoor' }, 'afternoon');
    expect(w.score).toBeLessThan(60);
  });
});

describe('scoring', () => {
  test('closed gated low', () => {
    const r = computeVisitScore({ weatherScore: 90, crowdScore: 90, trafficScore: 90, scenicScore: 90, timeScore: 90, openingScore: 5, preferenceScore: 50 }, { cat: 'fort' });
    expect(r.visitScore).toBeLessThanOrEqual(15);
  });
  test('openingToScore', () => {
    expect(openingToScore({ status: 'OPEN' })).toBe(90);
    expect(openingToScore({ status: 'CLOSED' })).toBe(5);
  });
});

describe('confidence', () => {
  test('more data higher confidence', () => {
    const low = computeConfidence({});
    const high = computeConfidence({ hasWeather: true, hasCoords: true, hasOpeningHours: true, hasCategoryRules: true });
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});

describe('integration', () => {
  test('getTravelIntelligence fields', () => {
    const intel = getTravelIntelligence(fort, ist('2026-01-15', '16:30'), { tempC: 26, condition: 'Clear' });
    expect(intel.visitScore).toBeGreaterThanOrEqual(0);
    expect(intel.explanation.bullets.length).toBeGreaterThan(0);
    expect(['estimated','predicted']).toContain(intel.crowd.source);
    expect(intel.confidence.confidence).toBeGreaterThan(40);
  });
  test('rankPlacesForDay sorted', () => {
    const ranked = rankPlacesForDay([
      fort,
      { name: 'Closed Museum', cat: 'museum', ot: '10:00', ct: '11:00', coords: JAIPUR },
    ], ist('2026-01-15', '16:00'), { tempC: 25, condition: 'Clear' });
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
  test('buildDayPlan returns stops', () => {
    const plan = buildDayPlan([
      fort,
      { name: 'City Palace', cat: 'monument', ot: '09:00', ct: '17:00', coords: [26.925, 75.82], is_sunset_spot: true },
      { name: 'Local Cafe', cat: 'food', ot: '08:00', ct: '22:00', coords: [26.91, 75.79] },
    ], { now: ist('2026-01-15', '09:00'), weather: { tempC: 24, condition: 'Clear' }, originCoords: JAIPUR, maxStops: 4 });
    expect(plan.stopCount).toBeGreaterThan(0);
    expect(plan.stops[0]).toHaveProperty('arriveAt');
    expect(plan.stops[0]).toHaveProperty('leaveAt');
  });
  test('dynamicAdvice for closed place', () => {
    const intel = getTravelIntelligence(
      { name: 'Museum', cat: 'museum', ot: '10:00', ct: '11:00', coords: JAIPUR },
      ist('2026-01-15', '15:00'), null
    );
    const advice = dynamicAdvice(intel);
    expect(advice.actions.length).toBeGreaterThan(0);
    expect(advice.headline).toBeTruthy();
  });
});

const { festivalCrowdMultiplier, getActiveFestivals } = require('../services/travelIntelligence/festivalEngine');
const { estimateTravelAsync } = require('../services/travelIntelligence/trafficEngine');

describe('festivalEngine', () => {
  test('Republic Day increases crowd multiplier', () => {
    const r = festivalCrowdMultiplier(new Date('2026-01-26T12:00:00+05:30'), { placeCat: 'monument' });
    expect(r.multiplier).toBeGreaterThan(1);
    expect(r.festivals.some((f) => f.id === 'republic_day')).toBe(true);
  });
  test('ordinary day is neutral', () => {
    const r = festivalCrowdMultiplier(new Date('2026-06-10T12:00:00+05:30'), {});
    expect(r.multiplier).toBe(1);
  });
});

describe('routingEngine fallback', () => {
  test('estimateTravelAsync falls back without inventing live', async () => {
    const t = await estimateTravelAsync({
      fromCoords: [26.91, 75.78],
      toCoords: [26.92, 75.79],
      departMin: 540,
      enableLiveRouting: false,
    });
    expect(t.source).toBe('estimated');
    expect(t.travelMinutes).toBeGreaterThan(0);
  }, 15000);
});

const { lookupHistoricalCrowd } = require('../services/travelIntelligence/historicalCrowdStore');
const { multiDayAdvice } = require('../services/travelIntelligence/itineraryEngine');
const { computeGoldenHours, isInGoldenHour } = require('../services/travelIntelligence/timeEngine');

describe('historicalCrowdStore', () => {
  test('looks up known place', () => {
    const h = lookupHistoricalCrowd({ name: 'Amber Fort', cat: 'fort' });
    expect(h).toBeTruthy();
    expect(h.avgScore).toBeGreaterThan(0);
    expect(h.sampleSize).toBeGreaterThan(0);
  });
  test('unknown place returns null', () => {
    expect(lookupHistoricalCrowd({ name: 'Totally Unknown Spot XYZ' })).toBeNull();
  });
});

describe('blue hour', () => {
  test('includes blue hour windows', () => {
    const gh = computeGoldenHours(360, 1110);
    expect(gh.morningBlue).toBeTruthy();
    expect(gh.eveningBlue).toBeTruthy();
    const state = isInGoldenHour(gh.eveningBlue.startMin + 1, gh);
    expect(state.blue).toBe(true);
  });
});

describe('multiDayAdvice', () => {
  test('suggests reschedule on poor outdoor weather', () => {
    const result = multiDayAdvice([{
      name: 'Beach',
      intel: {
        name: 'Beach', category: 'beach', visitScore: 30, isOpenNow: true,
        weather: { suitability: 'Very Poor' }, crowd: { level: 'Low' },
      },
    }]);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].action).toBe('reschedule');
  });
});

describe('day plan 2-opt', () => {
  test('optimizer field present for multi-stop plans', () => {
    const { buildDayPlan } = require('../services/travelIntelligence');
    const plan = buildDayPlan([
      { name: 'A', cat: 'fort', ot: '09:00', ct: '18:00', coords: [26.91, 75.78] },
      { name: 'B', cat: 'monument', ot: '09:00', ct: '18:00', coords: [26.92, 75.82] },
      { name: 'C', cat: 'food', ot: '08:00', ct: '22:00', coords: [26.915, 75.79] },
    ], { now: new Date('2026-01-15T09:00:00+05:30'), originCoords: [26.91, 75.78], maxStops: 5, weather: { tempC: 24, condition: 'Clear' } });
    expect(plan.stopCount).toBeGreaterThan(0);
    expect(plan.optimizer).toMatch(/2-opt|greedy/);
  });
});
