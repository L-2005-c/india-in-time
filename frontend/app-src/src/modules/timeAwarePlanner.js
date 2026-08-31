/**
 * Time-aware day builder — meal slots + timing discipline + geographic clustering.
 */
import { createBreakStop } from './planner.js';
import { stopTimeScore as defaultStopTimeScore } from '../utils/stop-scoring.js';

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

function _nearbyBoost(prevCoords, coords) {
  const km = distKm(prevCoords, coords);
  if (km <= 1.2) return 38; // Direct neighbor / walking cluster
  if (km <= 3.0) return 26; // Same neighborhood
  if (km <= 5.5) return 14;
  if (km <= 8.5) return 0;
  if (km <= 14) return -24; // Cross-town jump
  return -45; // Extreme zigzag penalty
}

function isFood(loc) {
  const cat = String(loc?.cat || '').toLowerCase();
  const name = String(loc?.name || '').toLowerCase();
  return cat === 'food' || cat === 'restaurant' || cat === 'cafe' || /restaurant|hotel|dhaba|biryani|vantillu|sweet india|daspalla|bakery|cafe|tiffin/i.test(name);
}

function parseTimeToMin(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  return null;
}

/**
 * @param {object} deps getSmartTravelTime, getSmartVisitTime, cityId, allLocs, stopTimeScore, getOpeningStatus, personas, tripMode, preferredCategories
 */
export function buildTimeAwareDay(stops, startMin, maxT, startCoords, temp, breakEvery = 0, breakDuration = 0, deps = {}) {
  const getSmartTravelTime = deps.getSmartTravelTime || (() => 15);
  const getSmartVisitTime = deps.getSmartVisitTime || (() => 45);
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
  let lastFoodLeaveMin = -999;
  const remaining = [...(stops || [])];
  const day = [];
  const usedIds = new Set();
  const supplementalPool = LOCS.filter((l) => !(stops || []).some((s) => s.id === l.id));

  function pickBest(pool, requireFood = false) {
    let best = null;
    const lastStop = day.length ? day[day.length - 1] : null;
    const lastWasFood = lastStop && isFood(lastStop);

    for (let i = 0; i < pool.length; i++) {
      const loc = pool[i];
      if (usedIds.has(loc.id) || day.some((d) => d.id === loc.id || d.name === loc.name)) continue;
      
      const isThisFood = isFood(loc);

      // Require food mode (e.g. lunch/dinner slot)
      if (requireFood && !isThisFood) continue;

      // Anti-consecutive food rule: Never schedule 2 food places in a row
      if (lastWasFood && isThisFood && !requireFood) continue;

      // Pacing rule: Don't schedule another food place within 2.5 hours of a previous meal
      if (isThisFood && (currentMin - lastFoodLeaveMin < 150)) continue;

      const travel = getSmartTravelTime(prevCoords, loc.coords, cityId, currentMin, day.length === 0);
      const visit = getSmartVisitTime(loc, currentMin + travel, new Date().getDay());
      const arrive = currentMin + travel;
      let actualVisit = visit;
      if (used + travel + actualVisit > maxT) actualVisit = maxT - (used + travel);
      if (actualVisit < 20) continue;

      // Strict opening hours check
      const open = getOpening(loc, arrive);
      if (!open || open.isOpenNow === false || open.open === false || open.status === 'closed') {
        continue;
      }
      if (loc.ct) {
        const ctMin = parseTimeToMin(loc.ct);
        if (ctMin != null && arrive + Math.min(25, actualVisit) > ctMin) {
          continue; // Closes before we can experience it
        }
      }

      // Meal slot limits: Max 1 lunch, max 1 dinner
      if (isThisFood) {
        const isLunchSlot = arrive >= 11.5 * 60 && arrive <= 15.5 * 60;
        const isDinnerSlot = arrive >= 18.5 * 60 && arrive <= 22 * 60;
        if (hasLunch && isLunchSlot) continue;
        if (hasDinner && isDinnerSlot) continue;
      }

      let score = scoreFn(loc, arrive, temp, i, 0, deps.personas, deps.tripMode);
      if (preferred.length && preferred.includes(String(loc.cat || '').toLowerCase())) score += 15;
      
      // Apply spatial proximity reward to group nearby places in the same geographic cluster
      if (prevCoords && loc.coords) {
        score += _nearbyBoost(prevCoords, loc.coords);
      }

      // Climate & Weather Intelligence
      const isOutdoor = !['food', 'museum', 'cafe', 'restaurant'].includes(String(loc.cat || '').toLowerCase());
      if (temp != null && temp >= 33 && arrive >= 11.5 * 60 && arrive <= 15.5 * 60) {
        if (isOutdoor) score -= 24;
        else score += 18;
      }

      // Scenic Golden Hour alignment
      if ((loc.is_sunset_spot || ['beach', 'scenic', 'hill', 'viewpoint'].includes(String(loc.cat || '').toLowerCase())) && arrive >= 16.75 * 60 && arrive <= 18.5 * 60) {
        score += 26;
      }

      // Food scoring
      if (isThisFood) {
        if (arrive >= 12 * 60 && arrive <= 14.5 * 60 && !hasLunch) score += 32;
        else if (arrive >= 19 * 60 && arrive <= 21.5 * 60 && !hasDinner) score += 32;
        else if (!foodWanted) score -= 30;
      }

      if (score < 20 && !isThisFood && pool.length > 3) continue;
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
      lastFoodLeaveMin = leave;
      if (arrive >= 11.5 * 60 && arrive <= 15.5 * 60) hasLunch = true;
      if (arrive >= 18.5 * 60 && arrive <= 22 * 60) hasDinner = true;
    }
  }

  while (remaining.length && used < maxT - 25) {
    // Scheduled lunch food stop when user wants food
    if (foodWanted && !hasLunch && currentMin >= 12 * 60 && currentMin <= 14.5 * 60) {
      const foodPick = pickBest([...remaining, ...supplementalPool], true);
      if (foodPick) {
        const idx = remaining.findIndex((r) => r.id === foodPick.loc.id);
        if (idx >= 0) remaining.splice(idx, 1);
        pushStop(foodPick.loc, foodPick.travel, foodPick.actualVisit, foodPick.arrive);
        continue;
      }
    }
    // Scheduled dinner food stop when user wants food
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

  // Backfill: Only backfill non-food sightseeing activities (unless a primary meal was missed)
  while (used < maxT - 40) {
    const wantFood = foodWanted && ((currentMin >= 12 * 60 && currentMin <= 15 * 60 && !hasLunch)
      || (currentMin >= 18.5 * 60 && currentMin <= 21 * 60 && !hasDinner));
    let pool = supplementalPool;
    if (wantFood) {
      pool = supplementalPool.filter(isFood);
    } else {
      // Don't backfill duplicate food places
      pool = supplementalPool.filter((l) => !isFood(l));
      if (preferred.length) {
        const matched = pool.filter((l) => preferred.includes(String(l.cat || '').toLowerCase()));
        if (matched.length) pool = matched;
      }
    }
    const pick = pickBest(pool.length ? pool : supplementalPool, wantFood);
    if (!pick) break;
    const si = supplementalPool.indexOf(pick.loc);
    if (si >= 0) supplementalPool.splice(si, 1);
    pushStop(pick.loc, pick.travel, pick.actualVisit, pick.arrive);
  }

  // Populate nearbySpots for each stop from unused locations
  const allUsed = new Set(day.map((d) => String(d.id || d.name)));
  day.forEach((stop) => {
    if (stop.isBreak || !stop.coords || stop.coords.length < 2) return;
    const candidates = LOCS.filter((l) => !allUsed.has(String(l.id || l.name)) && l.coords && l.coords.length >= 2);
    stop.nearbySpots = candidates
      .map((c) => ({
        id: c.id || c.name,
        name: c.name,
        category: c.cat || 'default',
        coords: c.coords,
        distanceM: Math.round(distKm(stop.coords, c.coords) * 1000),
      }))
      .filter((c) => c.distanceM <= 1200)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
  });

  return Array.isArray(day) ? day : [];
}

