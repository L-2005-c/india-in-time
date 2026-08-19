/**
 * Time-aware day builder — meal slots + timing discipline.
 */
import { createBreakStop } from './planner.js';

function distKm(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return 999;
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLon = toR(b[1] - a[1]);
  const lat1 = toR(a[0]);
  const lat2 = toR(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearbyBoost(prevCoords, coords) {
  const km = distKm(prevCoords, coords);
  if (km <= 1.5) return 30;
  if (km <= 3.5) return 22;
  if (km <= 6) return 10;
  if (km <= 10) return 0;
  if (km <= 15) return -12;
  return -25;
}


import { stopTimeScore as defaultStopTimeScore } from '../utils/stop-scoring.js';

function isFood(loc) {
  const cat = String(loc?.cat || '').toLowerCase();
  const name = String(loc?.name || '').toLowerCase();
  return cat === 'food' || cat === 'restaurant' || /restaurant|cafe|food court|vantillu|dhaba|biryani/i.test(name);
}

/**
 * @param {object} deps getSmartTravelTime, getSmartVisitTime, cityId, allLocs, stopTimeScore, getOpeningStatus, personas, tripMode, preferredCategories
 */
export function buildTimeAwareDay(stops, startMin, maxT, startCoords, temp, breakEvery = 0, breakDuration = 0, deps = {}) {
  const getSmartTravelTime = deps.getSmartTravelTime;
  const getSmartVisitTime = deps.getSmartVisitTime;
  const cityId = deps.cityId || 'india';
  const LOCS = deps.allLocs || [];
  const getOpening = deps.getOpeningStatus || (() => ({ isOpenNow: true }));
  const scoreFn = deps.stopTimeScore || ((loc, arrive, t, i) => defaultStopTimeScore(loc, arrive, t, i, 0, deps.personas, deps.tripMode));
  const preferred = (deps.preferredCategories || []).map((c) => String(c).toLowerCase());
  const foodWanted = preferred.includes('food') || (deps.personas || []).some((p) => /food/i.test(String(p)));

  let currentMin = startMin;
  let used = 0;
  let activeSinceBreak = 0;
  let prevCoords = startCoords;
  let hasLunch = false;
  let hasDinner = false;
  const remaining = [...(stops || [])];
  const day = [];
  const usedIds = new Set();
  const supplementalPool = LOCS.filter((l) => !(stops || []).some((s) => s.id === l.id));

  function pickBest(pool, requireFood = false) {
    let best = null;
    for (let i = 0; i < pool.length; i++) {
      const loc = pool[i];
      if (usedIds.has(loc.id) || day.some((d) => d.id === loc.id)) continue;
      if (requireFood && !isFood(loc)) continue;
      const travel = getSmartTravelTime(prevCoords, loc.coords, cityId, currentMin, day.length === 0);
      const visit = getSmartVisitTime(loc, currentMin + travel, new Date().getDay());
      const arrive = currentMin + travel;
      let actualVisit = visit;
      if (used + travel + actualVisit > maxT) actualVisit = maxT - (used + travel);
      if (actualVisit < 20) continue;
      const open = getOpening(loc, arrive);
      if (open && open.isOpenNow === false) continue;
      let score = scoreFn(loc, arrive, temp, i, 0, deps.personas, deps.tripMode);
      if (preferred.length && preferred.includes(String(loc.cat || '').toLowerCase())) score += 15;
      // Refuse terrible timing for non-food unless pool is empty
      if (score < 25 && !isFood(loc) && pool.length > 3) continue;
      if (!best || score > best.score) best = { loc, travel, actualVisit, arrive, score, i };
    }
    return best;
  }

  function toHHMM(min) {
    const m = ((Math.round(min) % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function pushStop(loc, travel, visit, arrive) {
    const leave = arrive + visit;
    day.push({
      ...loc,
      arriveMin: arrive,
      leaveMin: leave,
      vt: visit,
      tt: travel,
      travelMin: travel,
      arriveAt: toHHMM(arrive),
      leaveAt: toHHMM(leave),
      scheduleLocked: true,
      geoOptimized: false,
    });
    usedIds.add(loc.id);
    currentMin = leave;
    used += travel + visit;
    activeSinceBreak += travel + visit;
    prevCoords = loc.coords || prevCoords;
    if (isFood(loc)) {
      if (arrive >= 11.5 * 60 && arrive <= 15 * 60) hasLunch = true;
      if (arrive >= 18.5 * 60 && arrive <= 22 * 60) hasDinner = true;
    }
  }

  while (remaining.length && used < maxT - 25) {
    // Force lunch food stop when user wants food
    if (foodWanted && !hasLunch && currentMin >= 12 * 60 && currentMin <= 14.5 * 60) {
      const foodPick = pickBest([...remaining, ...supplementalPool], true);
      if (foodPick) {
        const idx = remaining.findIndex((r) => r.id === foodPick.loc.id);
        if (idx >= 0) remaining.splice(idx, 1);
        pushStop(foodPick.loc, foodPick.travel, foodPick.actualVisit, foodPick.arrive);
        continue;
      }
    }
    if (foodWanted && !hasDinner && currentMin >= 18.5 * 60 && currentMin <= 20.5 * 60) {
      const foodPick = pickBest([...remaining, ...supplementalPool], true);
      if (foodPick) {
        const idx = remaining.findIndex((r) => r.id === foodPick.loc.id);
        if (idx >= 0) remaining.splice(idx, 1);
        pushStop(foodPick.loc, foodPick.travel, foodPick.actualVisit, foodPick.arrive);
        continue;
      }
    }

    const pick = pickBest(remaining, false);
    if (!pick) break;
    remaining.splice(pick.i, 1);
    pushStop(pick.loc, pick.travel, pick.actualVisit, pick.arrive);

    if (breakEvery > 0 && breakDuration > 0 && activeSinceBreak >= breakEvery && used + breakDuration < maxT) {
      const bStart = currentMin;
      const br = createBreakStop(pick.loc, day.length, breakDuration);
      br.arriveMin = bStart;
      br.leaveMin = bStart + breakDuration;
      br.arriveAt = toHHMM(bStart);
      br.leaveAt = toHHMM(bStart + breakDuration);
      br.tt = 0;
      day.push(br);
      currentMin += breakDuration;
      used += breakDuration;
      activeSinceBreak = 0;
    }
  }

  // Backfill: prefer food at meal gaps, else category-matched
  while (used < maxT - 40) {
    const wantFood = foodWanted && ((currentMin >= 12 * 60 && currentMin <= 15 * 60 && !hasLunch)
      || (currentMin >= 18.5 * 60 && currentMin <= 21 * 60 && !hasDinner));
    let pool = supplementalPool;
    if (wantFood) pool = supplementalPool.filter(isFood);
    else if (preferred.length) {
      const matched = supplementalPool.filter((l) => preferred.includes(String(l.cat || '').toLowerCase()));
      if (matched.length) pool = matched;
    }
    const pick = pickBest(pool.length ? pool : supplementalPool, wantFood);
    if (!pick) break;
    const si = supplementalPool.indexOf(pick.loc);
    if (si >= 0) supplementalPool.splice(si, 1);
    pushStop(pick.loc, pick.travel, pick.actualVisit, pick.arrive);
  }

  return Array.isArray(day) ? day : [];
}
