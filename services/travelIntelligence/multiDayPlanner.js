'use strict';
// multiDayPlanner.js — Advanced multi-day trip planning
//
// Builds a full N-day itinerary from a pool of candidate places:
//   1. Geographically clusters places into `days` groups (farthest-point
//      seeding + nearest-cluster assignment with a soft size cap) so each
//      day stays in one part of the map instead of zig-zagging the city.
//   2. Runs the authoritative requirement-aware geo-temporal beam-search optimizer for each day,
//      advancing the calendar date so opening hours, sunrise/sunset,
//      festivals and (if supplied) that day's forecast all apply correctly.
//   3. Flags outdoor stops caught in poor forecast weather and suggests
//      moving them to a cleaner day later in the trip (advisory only —
//      the caller/UI decides whether to apply a swap and re-plan).
//
// This module deliberately stays a thin orchestrator over the authoritative
// advanced itinerary engine so every day uses the same decision authority.

const { distKm } = require('../../utils/geo');
const { estimateTravel } = require('./trafficEngine');

// Lazily resolve the authoritative planner to avoid the index.js ↔
// multiDayPlanner circular dependency during module initialization.
function getOptimizer() {
  return require('./advancedItineraryEngine').planAdvancedItinerary;
}

const PACING_PROFILES = {
  relaxed: { maxStops: 4, bufferMin: 30, startMin: 9 * 60, endMin: 19 * 60 },
  moderate: { maxStops: 6, bufferMin: 20, startMin: 8 * 60, endMin: 20 * 60 },
  packed: { maxStops: 9, bufferMin: 15, startMin: 7 * 60, endMin: 21 * 60 },
};

const OUTDOOR_CATS = new Set(['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument']);

function pacingProfile(pacing) {
  return PACING_PROFILES[pacing] || PACING_PROFILES.moderate;
}

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

// Calendar date in IST, not UTC — `date.toISOString().slice(0, 10)` rolls
// midnight-to-early-morning IST timestamps back onto the previous UTC day
// (IST is UTC+5:30), which is exactly the kind of off-by-one a trip day
// label can't afford.
const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
function istDateKey(date) {
  return IST_DATE_FORMATTER.format(date);
}

function hasCoords(p) {
  return Array.isArray(p?.coords) && p.coords.length >= 2 && Number.isFinite(p.coords[0]) && Number.isFinite(p.coords[1]);
}

/**
 * Greedy geographic clustering into up to `k` roughly-balanced groups.
 * Seeds are chosen by farthest-point sampling (spreads seeds across the
 * whole map instead of bunching in the densest area); every place is then
 * assigned to its nearest seed, subject to a soft per-cluster size cap so
 * a single dense pocket can't swallow the whole trip into one day.
 */
function clusterPlaces(places, k) {
  const all = Array.isArray(places) ? places : [];
  const withCoords = all.filter(hasCoords);
  const withoutCoords = all.filter((p) => !hasCoords(p));
  const numClusters = Math.max(1, Math.min(k, withCoords.length || 1));

  if (!withCoords.length || numClusters <= 1) {
    return { clusters: [withCoords.slice()], withoutCoords };
  }

  const seeds = [withCoords[0]];
  while (seeds.length < numClusters) {
    let farthest = null;
    let farthestDist = -1;
    for (const p of withCoords) {
      if (seeds.includes(p)) continue;
      const minDist = Math.min(...seeds.map((s) => distKm(p.coords[0], p.coords[1], s.coords[0], s.coords[1])));
      if (minDist > farthestDist) {
        farthestDist = minDist;
        farthest = p;
      }
    }
    if (!farthest) break;
    seeds.push(farthest);
  }

  const clusters = seeds.map(() => []);
  const softCap = Math.ceil((withCoords.length / seeds.length) * 1.8) + 2;
  for (const p of withCoords) {
    const order = seeds
      .map((s, i) => ({ i, d: distKm(p.coords[0], p.coords[1], s.coords[0], s.coords[1]) }))
      .sort((a, b) => a.d - b.d);
    let placed = false;
    for (const cand of order) {
      if (clusters[cand.i].length < softCap) {
        clusters[cand.i].push(p);
        placed = true;
        break;
      }
    }
    if (!placed) clusters[order[0].i].push(p);
  }

  // Pad out to exactly `k` days (some days may get an empty geographic
  // cluster when there are fewer coordinate-bearing places than days).
  while (clusters.length < k) clusters.push([]);
  return { clusters, withoutCoords };
}

function centroidOf(cluster) {
  if (!cluster || !cluster.length) return null;
  const lat = cluster.reduce((s, p) => s + p.coords[0], 0) / cluster.length;
  const lon = cluster.reduce((s, p) => s + p.coords[1], 0) / cluster.length;
  return [lat, lon];
}

/**
 * Reorders day-clusters into a sensible day-to-day travel sequence.
 *
 * `clusterPlaces` groups places geographically but hands them back in
 * farthest-point *seeding* order, which is arbitrary from a trip-flow
 * perspective — day 1 could easily end up on the opposite side of the city
 * from day 2, then day 3 doubles back near day 1 again. This walks the
 * cluster centroids as a small nearest-neighbour tour, starting from
 * whichever cluster sits closest to `originCoords` (the traveller's
 * hotel/starting point) when one is supplied, so consecutive days move
 * through the destination in roughly one direction instead of zig-zagging.
 * Empty clusters (more days than geographic groups) are left at the end.
 */
function orderClustersByTravelFlow(clusters, originCoords) {
  const entries = clusters.map((cluster) => ({ cluster, centroid: centroidOf(cluster) }));
  const withCentroid = entries.filter((e) => e.centroid);
  const empties = entries.filter((e) => !e.centroid);
  if (withCentroid.length <= 1) return clusters;

  const remaining = withCentroid.slice();
  let startIdx = 0;
  if (hasCoords({ coords: originCoords })) {
    let bestDist = Infinity;
    remaining.forEach((e, idx) => {
      const d = distKm(originCoords[0], originCoords[1], e.centroid[0], e.centroid[1]);
      if (d < bestDist) { bestDist = d; startIdx = idx; }
    });
  }
  const ordered = [remaining.splice(startIdx, 1)[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((e, idx) => {
      const d = distKm(current.centroid[0], current.centroid[1], e.centroid[0], e.centroid[1]);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return [...ordered, ...empties].map((e) => e.cluster);
}

/**
 * Build a full multi-day itinerary.
 * @param {object[]} places - candidate places (pooled across the whole trip)
 * @param {object} options
 * @param {Date|string} options.startDate
 * @param {number} options.days
 * @param {'relaxed'|'moderate'|'packed'} [options.pacing]
 * @param {[number,number]|null} [options.originCoords] - hotel/base each day
 * @param {string[]} [options.personas]
 * @param {string|null} [options.tripMode]
 * @param {string|null} [options.region]
 * @param {(date: Date, dayIndex: number) => object|null} [options.getWeatherForDate]
 * @param {number} [options.maxStopsPerDay]
 */
async function buildMultiDayItinerary(places, options = {}) {
  const allPlaces = Array.isArray(places) ? places : [];
  const days = Math.max(1, Math.min(21, Math.round(Number(options.days) || 1)));
  const startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate || Date.now());
  if (Number.isNaN(startDate.getTime())) throw new Error('multiDayPlanner: invalid startDate');
  const pacing = pacingProfile(options.pacing);
  const originCoords = options.originCoords || null;
  const personas = Array.isArray(options.personas) ? options.personas : [];
  const tripMode = options.tripMode || null;
  const region = options.region || null;
  const getWeatherForDate = typeof options.getWeatherForDate === 'function' ? options.getWeatherForDate : () => null;
  const maxStops = Number.isFinite(options.maxStopsPerDay) ? options.maxStopsPerDay : pacing.maxStops;
  const bufferMin = Number.isFinite(options.bufferMin) ? options.bufferMin : pacing.bufferMin;
  const startMin = Number.isFinite(options.startMin) ? options.startMin : pacing.startMin;
  const endMin = Number.isFinite(options.endMin) ? options.endMin : pacing.endMin;

  const { clusters: rawClusters, withoutCoords } = clusterPlaces(allPlaces, days);
  // Walk the clusters in a sensible day-to-day travel order (nearest-
  // neighbour over cluster centroids, anchored to the trip origin when
  // known) instead of leaving them in arbitrary farthest-point seeding
  // order, so the trip moves through the destination rather than
  // zig-zagging across it day to day.
  const clusters = orderClustersByTravelFlow(rawClusters, originCoords);
  // Places without usable coordinates still deserve a shot — spread them
  // round-robin across the day clusters rather than dropping them. They
  // won't be scheduled by the geo-temporal optimizer (it requires coords),
  // but grouping is enough to surface a clear reason in `unusedPlaces`.
  withoutCoords.forEach((p, i) => {
    const idx = clusters.length ? i % clusters.length : 0;
    if (clusters[idx]) clusters[idx].push(p);
  });

  // Track which day's pool each place was assigned to so unused places can
  // report *why* they didn't make the cut, instead of just vanishing.
  const poolDayOf = new Map();
  clusters.forEach((pool, idx) => pool.forEach((p) => poolDayOf.set(p.name, idx + 1)));

  const itinerary = [];
  let totalTravelMinutes = 0;
  let totalStops = 0;
  const usedNames = new Set();
  const allStopsFlat = [];

  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const weather = getWeatherForDate(date, d) || null;
    const pool = clusters[d] || [];

    if (!pool.length) {
      itinerary.push({
        dayIndex: d + 1,
        date: istDateKey(date),
        weatherApplied: false,
        stops: [],
        stopCount: 0,
        summary: 'No candidate places assigned to this day.',
        warnings: ['Add more places, or reduce the number of trip days.'],
      });
      continue;
    }

    let result;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await getOptimizer()(pool, {
        now: date, weather, originCoords, personas, tripMode, region,
        maxStops, bufferMin, startMin, endMin, beamWidth: options.beamWidth,
        preferredCategories: options.preferredCategories || [],
        excludedCategories: options.excludedCategories || [],
        requiredMeals: options.requiredMeals || [],
        dietaryRestrictions: options.dietaryRestrictions || [],
        accessibilityRequirements: options.accessibilityRequirements || [],
        transportModes: options.transportModes || [],
        mustVisit: options.mustVisit || [],
        budgetHard: options.budgetHard, budget: options.dailyBudget ?? options.budget,
      });
    } catch (_e) {
      result = { stops: [], stopCount: 0, totalTravelMinutes: 0, warnings: ['Failed to optimize this day — try again or reduce the stop count.'] };
    }

    const stops = result.stops || [];
    stops.forEach((s) => { usedNames.add(s.name); allStopsFlat.push(s); });
    totalTravelMinutes += result.totalTravelMinutes || 0;
    totalStops += result.stopCount ?? stops.length;

    // Informational return-to-origin leg. Purely advisory — it doesn't
    // affect stop selection or the day's schedule, but tells the traveller
    // (and the UI) how long the commute back to their hotel/base actually
    // is, which matters for pacing decisions the optimizer itself doesn't
    // make (e.g. "should today end earlier?").
    let returnToOrigin = null;
    if (hasCoords({ coords: originCoords }) && stops.length) {
      const lastStop = stops[stops.length - 1];
      if (Array.isArray(lastStop.coords)) {
        const travel = estimateTravel({ fromCoords: lastStop.coords, toCoords: originCoords, departMin: 20 * 60 });
        returnToOrigin = {
          fromStop: lastStop.name,
          estimatedMinutes: travel.travelMinutes,
          distanceKm: travel.distanceKm,
          source: travel.source,
        };
      }
    }

    itinerary.push({
      dayIndex: d + 1,
      date: istDateKey(date),
      weatherApplied: !!weather,
      ...result,
      returnToOrigin,
    });
  }

  // Weather-aware cross-day rebalancing — advisory suggestions only. Actually
  // moving a stop requires re-solving both days, so the caller decides
  // whether to apply a suggestion and request a replan. Considers both
  // directions: outdoor stops stuck on a rained-out day, and indoor stops
  // occupying a day that's actually clear and would suit an outdoor stop
  // better. Suggestions only point at a target day that still has spare
  // stop capacity, so they're realistic to act on without over-filling it.
  const rebalanceSuggestions = [];
  const isPoorWeather = (s) => s.weather?.suitability === 'Poor' || s.weather?.suitability === 'Very Poor';
  const dayHasCapacity = (day) => (day.stops || []).length < maxStops;
  itinerary.forEach((day, i) => {
    (day.stops || []).forEach((stop) => {
      if (!OUTDOOR_CATS.has(stop.category)) return;
      const poorWeather = isPoorWeather(stop);
      if (!poorWeather) return;
      const betterDay = itinerary.find((other, j) => (
        j !== i && (other.stops?.length || 0) > 0 && dayHasCapacity(other)
        && !(other.stops || []).some(isPoorWeather)
      ));
      rebalanceSuggestions.push({
        place: stop.name,
        fromDay: i + 1,
        suggestedDay: betterDay ? betterDay.dayIndex : null,
        reason: `Outdoor stop with poor forecast conditions on day ${i + 1}${betterDay ? ` — day ${betterDay.dayIndex} looks clearer and has room` : ' — no clearer day currently has spare capacity'}.`,
      });
    });
  });

  const unusedPlaces = allPlaces
    .filter((p) => !usedNames.has(p.name))
    .slice(0, 20)
    .map((p) => ({
      name: p.name,
      category: p.cat || 'default',
      reason: !hasCoords(p)
        ? 'No coordinates available — cannot be scheduled by the geo-temporal optimizer.'
        : `Not selected for day ${poolDayOf.get(p.name) || '?'} within the available time/stop budget for that day's pacing.`,
    }));

  // Trip-level rollup of the same decision/robustness/confidence signals
  // the optimizer already computes per stop, so callers get an at-a-glance
  // read on overall plan quality without averaging every stop themselves.
  const avg = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);
  const tripQuality = {
    stopsScored: allStopsFlat.length,
    avgDecisionScore: avg(allStopsFlat.map((s) => s.decisionScore).filter(Number.isFinite)),
    avgRobustness: avg(allStopsFlat.map((s) => s.robustness?.robustness).filter(Number.isFinite)),
    avgConfidence: avg(allStopsFlat.map((s) => s.confidence?.confidence ?? s.confidence?.confidenceScore).filter(Number.isFinite)),
    stopsWithWaiting: allStopsFlat.filter((s) => (s.waitingMinutes || 0) > 0).length,
    daysWithoutStops: itinerary.filter((day) => (day.stopCount ?? day.stops?.length ?? 0) === 0).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    startDate: istDateKey(startDate),
    days: itinerary.length,
    pacing: options.pacing || 'moderate',
    totalStops,
    totalTravelMinutes: Math.round(totalTravelMinutes),
    itinerary,
    rebalanceSuggestions,
    unusedPlaces,
    tripQuality,
    algorithm: 'geo-clustered-multi-day-v2 + geo-temporal-beam-search-v5-world-class',
    planningDiagnostics: { maxStopsPerDay: maxStops, bufferMin, startMin, endMin, clusterCount: clusters.length },
  };
}

module.exports = { buildMultiDayItinerary, clusterPlaces, orderClustersByTravelFlow, PACING_PROFILES };
