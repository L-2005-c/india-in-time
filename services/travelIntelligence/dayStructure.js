'use strict';

/**
 * Advanced day structure v4.2 — balanced phases + multi-category coverage.
 * Food is at most one lunch + one dinner; beaches/temples/scenic are required when preferred.
 */

const PHASES = [
  { id: 'morning', startMin: 5 * 60, endMin: 11 * 60 + 30, prefer: ['beach', 'temple', 'scenic', 'fort', 'monument', 'park'] },
  { id: 'lunch', startMin: 11 * 60 + 30, endMin: 15 * 60, prefer: ['food'] },
  { id: 'afternoon', startMin: 15 * 60, endMin: 17 * 60 + 30, prefer: ['temple', 'museum', 'fort', 'scenic', 'park', 'market'] },
  { id: 'golden', startMin: 17 * 60 + 30, endMin: 19 * 60, prefer: ['beach', 'scenic'] },
  { id: 'dinner', startMin: 19 * 60, endMin: 22 * 60, prefer: ['food'] },
  { id: 'night', startMin: 22 * 60, endMin: 24 * 60, prefer: ['market', 'scenic'] },
];

function phaseAt(min) {
  const m = Number(min) || 0;
  return PHASES.find((p) => m >= p.startMin && m < p.endMin) || PHASES[PHASES.length - 1];
}

function normalizeCat(place) {
  return String(place?.cat || place?.category || 'default').toLowerCase();
}

/** Lodging / non-attraction — should not dominate a sightseeing day. */
function isLodgingOrFiller(place) {
  const name = String(place?.name || '').toLowerCase();
  const cat = normalizeCat(place);
  if (cat === 'hotel' || cat === 'lodging' || cat === 'stay') return true;
  // "Alpha Hotel Vizag" style names that are not food courts
  if (/\bhotel\b|\bresort\b|\blodge\b|\bguesthouse\b|\bguest house\b/.test(name)
      && !/food|restaurant|cafe|kitchen|dhaba|biryani|mess|veg\b/i.test(name)) {
    return true;
  }
  return false;
}

function isFood(place) {
  if (isLodgingOrFiller(place)) return false;
  const cat = normalizeCat(place);
  const name = String(place?.name || '').toLowerCase();
  return cat === 'food' || cat === 'restaurant' || cat === 'cafe'
    || /restaurant|cafe|dhaba|food court|mess|biryani|vantillu|kitchen|eatery/.test(name);
}

function isBeach(place) {
  const cat = normalizeCat(place);
  const name = String(place?.name || '').toLowerCase();
  if (cat === 'food' || cat === 'restaurant' || cat === 'cafe' || cat === 'hotel') return false;
  if (/food court|restaurant|cafe|hotel|dhaba|kitchen/.test(name)) return false;
  if (cat === 'beach') return true;
  return /\bbeach\b|\bbay\b|coast/.test(name);
}

function isTemple(place) {
  const cat = normalizeCat(place);
  const name = String(place?.name || '').toLowerCase();
  return cat === 'temple' || /temple|mandir|iskcon|church|mosque|gurudwara/.test(name);
}

function isScenic(place) {
  const cat = normalizeCat(place);
  return cat === 'scenic' || cat === 'viewpoint' || cat === 'hill' || cat === 'waterfall'
    || !!place?.is_sunset_spot || !!place?.is_sunrise_spot;
}

function phaseBonus(place, arrivalMin, preferredCats = []) {
  if (isLodgingOrFiller(place)) return { bonus: -40, phase: phaseAt(arrivalMin).id };

  const phase = phaseAt(arrivalMin);
  const cat = normalizeCat(place);
  const food = isFood(place);
  let bonus = 0;

  if (phase.prefer.includes(cat) || (food && phase.prefer.includes('food'))) bonus += 14;
  else if (phase.id === 'lunch' || phase.id === 'dinner') {
    if (food) bonus += 16;
    else bonus -= 6; // mild — don't wipe out temples near lunch
  } else if (food) {
    bonus -= 10; // food outside meal phases
  }

  const prefs = (preferredCats || []).map((c) => String(c).toLowerCase());
  if (prefs.includes(cat) || (prefs.includes('food') && food)) bonus += 12;
  if (prefs.includes('beach') && isBeach(place) && (phase.id === 'morning' || phase.id === 'golden')) bonus += 16;
  if (prefs.includes('temple') && isTemple(place) && (phase.id === 'morning' || phase.id === 'afternoon')) bonus += 14;
  if (prefs.includes('scenic') && isScenic(place) && phase.id !== 'lunch') bonus += 12;

  if ((isBeach(place) || isScenic(place)) && phase.id === 'afternoon') bonus -= 8;

  return { bonus, phase: phase.id };
}

function parseArrive(arriveAt) {
  if (typeof arriveAt === 'number') return arriveAt;
  const m = String(arriveAt || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatMin(m) {
  const x = Math.max(0, Math.round(m));
  const h = Math.floor(x / 60) % 24;
  const mm = x % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function coverageReport(stops, options = {}) {
  const preferred = (options.preferredCategories || []).map((c) => String(c).toLowerCase());
  const foodWanted = preferred.includes('food')
    || (options.personas || []).some((p) => /food/i.test(String(p)));
  const list = stops || [];
  const catsPresent = new Set(list.map((s) => String(s.category || s.cat || '').toLowerCase()));
  const hasLunchFood = list.some((s) => isFood(s) && parseArrive(s.arriveAt) >= 11.5 * 60 && parseArrive(s.arriveAt) <= 15 * 60);
  const hasDinnerFood = list.some((s) => isFood(s) && parseArrive(s.arriveAt) >= 18.5 * 60 && parseArrive(s.arriveAt) <= 22 * 60);
  const hasBeach = list.some(isBeach);
  const hasTemple = list.some(isTemple);
  const hasScenic = list.some(isScenic);
  const foodCount = list.filter(isFood).length;
  const missingPreferred = [];
  if (preferred.includes('beach') && !hasBeach) missingPreferred.push('beach');
  if (preferred.includes('temple') && !hasTemple) missingPreferred.push('temple');
  if (preferred.includes('scenic') && !hasScenic) missingPreferred.push('scenic');
  if (foodWanted && !hasLunchFood && !hasDinnerFood) missingPreferred.push('food');

  const warnings = [];
  if (foodWanted && !hasLunchFood) warnings.push('No lunch food stop in plan.');
  if (preferred.includes('beach') && !hasBeach) warnings.push('No beach stop despite Beaches preference.');
  if (preferred.includes('temple') && !hasTemple) warnings.push('No temple stop despite Temples preference.');
  if (foodCount > 2) warnings.push('Too many food stops — sightseeing may be under-represented.');

  return {
    hasLunchFood, hasDinnerFood, hasBeach, hasTemple, hasScenic, foodCount,
    missingPreferred, catsPresent: [...catsPresent], warnings, foodWanted,
  };
}

function makeStop(place, arrive, stay, label) {
  return {
    key: String(place.id || place.name),
    id: place.id || place.name,
    name: place.name,
    category: place.cat || 'default',
    coords: place.coords,
    departAt: formatMin(arrive - 20),
    travelMinutes: 20,
    travelSource: 'structure-repair',
    arriveAt: formatMin(arrive),
    waitingMinutes: 0,
    leaveAt: formatMin(arrive + stay),
    stayMinutes: stay,
    visitScore: 72,
    timingFit: 85,
    optimizationScore: 75,
    structureRepaired: true,
    repairSlot: label,
  };
}

/**
 * Balanced repair:
 * - At most one lunch + one dinner food
 * - Inject beach/temple/scenic when preferred and missing
 * - Never inject lodging
 */

/**
 * Force chronological, non-overlapping timeline from startMin.
 * Keeps stop ORDER by preferred arrive time, then packs sequentially.
 */

function coordsOf(s) {
  const c = s?.coords;
  if (Array.isArray(c) && c.length >= 2) return c;
  if (c && c.lat != null) return [c.lat, c.lng || c.lon];
  return null;
}
function haversineKm(a, b) {
  if (!a || !b) return 999;
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
/** Keep chronological bands but chain nearby stops (beach → lighthouse). */
function nearestNeighborReorder(stops) {
  if (!stops || stops.length < 3) return stops || [];
  const remaining = [...stops];
  const out = [remaining.shift()];
  while (remaining.length) {
    const prev = coordsOf(out[out.length - 1]);
    let bestIdx = 0;
    let bestScore = -1e9;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const km = haversineKm(prev, coordsOf(s));
      const timeDelta = Math.abs(parseArrive(s.arriveAt) - parseArrive(out[out.length - 1].arriveAt));
      // Prefer close + similar time; allow modest time swaps for big geo wins
      const score = (km <= 3.5 ? 40 : km <= 6 ? 15 : -km * 2) - timeDelta * 0.08;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    out.push(remaining.splice(bestIdx, 1)[0]);
  }
  return out;
}

function resequenceTimeline(stops, options = {}) {
  const startMin = Number.isFinite(options.startMin) ? options.startMin : 9 * 60;
  const endMin = Number.isFinite(options.endMin) ? options.endMin : startMin + 10 * 60;
  const buffer = Number.isFinite(options.bufferMin) ? options.bufferMin : 15;
  let list = [...(stops || [])].filter(Boolean);
  // Sort by arrive intent, then lightly re-order with nearest-neighbor so clusters stay together
  list.sort((a, b) => parseArrive(a.arriveAt || a.arriveMin) - parseArrive(b.arriveAt || b.arriveMin));
  list = nearestNeighborReorder(list);
  let cursor = startMin;
  const out = [];
  for (const s of list) {
    if (s.isBreak) {
      const stay = Math.max(10, Number(s.stayMinutes || s.vt) || 15);
      const arrive = cursor;
      const leave = arrive + stay;
      if (leave > endMin + 30) break;
      out.push({
        ...s,
        arriveAt: formatMin(arrive),
        leaveAt: formatMin(leave),
        departAt: formatMin(Math.max(startMin, arrive - 5)),
        stayMinutes: stay,
        vt: stay,
        travelMinutes: s.travelMinutes || 0,
        order: out.length + 1,
      });
      cursor = leave + buffer;
      continue;
    }
    const travel = Math.max(0, Number(s.travelMinutes || s.tt) || (out.length ? 20 : 10));
    const stay = Math.max(20, Number(s.stayMinutes || s.vt) || 45);
    let arrive = cursor + travel;
    // Prefer original meal/golden targets if still ahead of cursor
    const preferred = parseArrive(s.arriveAt);
    if (preferred >= cursor + travel && preferred <= endMin - stay) {
      arrive = preferred;
    }
    const leave = arrive + stay;
    if (arrive > endMin) break;
    out.push({
      ...s,
      departAt: formatMin(cursor),
      arriveAt: formatMin(arrive),
      leaveAt: formatMin(Math.min(leave, endMin + 60)),
      stayMinutes: stay,
      vt: stay,
      travelMinutes: travel,
      tt: travel,
      order: out.length + 1,
      arriveMin: arrive,
    });
    cursor = Math.min(leave, endMin + 60) + buffer;
  }
  return out;
}

function repairMealCoverage(stops, candidates, options = {}) {
  const preferred = (options.preferredCategories || []).map((c) => String(c).toLowerCase());
  const endMin = options.endMin != null ? options.endMin : 19 * 60;
  const startMin = options.startMin != null ? options.startMin : 9 * 60;
  let out = (stops || []).filter((s) => !isLodgingOrFiller(s));
  // Cap food: keep at most 1 in lunch window and 1 in dinner window; drop extras
  const lunchFoods = out.filter((s) => isFood(s) && parseArrive(s.arriveAt) >= 11.5 * 60 && parseArrive(s.arriveAt) <= 15 * 60);
  const dinnerFoods = out.filter((s) => isFood(s) && parseArrive(s.arriveAt) >= 18.5 * 60);
  const drop = new Set();
  lunchFoods.slice(1).forEach((s) => drop.add(s.name));
  dinnerFoods.slice(1).forEach((s) => drop.add(s.name));
  // Drop any non-meal food (e.g. 2–3pm second restaurant)
  out.forEach((s) => {
    if (!isFood(s)) return;
    const m = parseArrive(s.arriveAt);
    const lunch = m >= 11.5 * 60 && m <= 15 * 60;
    const dinner = m >= 18.5 * 60 && m <= 22 * 60;
    if (!lunch && !dinner) drop.add(s.name);
  });
  out = out.filter((s) => !drop.has(s.name));

  const pool = (candidates || []).filter((p) => !isLodgingOrFiller(p));
  const used = () => new Set(out.map((s) => s.name));
  let repaired = false;

  function pick(pred) {
    const u = used();
    return pool.find((p) => !u.has(p.name) && pred(p));
  }

  function insert(place, arrive, stay, label) {
    if (!place) return;
    out.push(makeStop(place, arrive, stay, label));
    out.sort((a, b) => parseArrive(a.arriveAt) - parseArrive(b.arriveAt));
    out = out.map((s, i) => ({ ...s, order: i + 1 }));
    repaired = true;
  }

  let report = coverageReport(out, options);

  // Preferred sightseeing first (morning / golden), then food
  if (preferred.includes('beach') && !report.hasBeach) {
    insert(pick(isBeach), Math.max(startMin + 30, 9 * 60 + 30), 75, 'beach-morning');
    // golden hour second beach only if still missing after morning attempt
    report = coverageReport(out, options);
    if (!report.hasBeach) insert(pick(isBeach), Math.min(endMin - 60, 17 * 60 + 45), 60, 'beach-golden');
  }
  if (preferred.includes('temple') && !coverageReport(out, options).hasTemple) {
    insert(pick(isTemple), Math.max(startMin + 90, 10 * 60 + 30), 50, 'temple');
  }
  if (preferred.includes('scenic') && !coverageReport(out, options).hasScenic) {
    insert(pick(isScenic), Math.min(endMin - 90, 16 * 60), 45, 'scenic');
  }

  report = coverageReport(out, options);
  if (report.foodWanted && !report.hasLunchFood) {
    insert(pick(isFood), 13 * 60, 50, 'lunch');
  }
  report = coverageReport(out, options);
  if (report.foodWanted && !report.hasDinnerFood && endMin >= 18 * 60) {
    insert(pick(isFood), Math.min(endMin - 45, 19 * 60 + 15), 50, 'dinner');
  }

  // Final cap: never more than 2 food stops
  const foods = out.filter(isFood).sort((a, b) => parseArrive(a.arriveAt) - parseArrive(b.arriveAt));
  if (foods.length > 2) {
    const keep = new Set([foods[0].name, foods[foods.length - 1].name]);
    out = out.filter((s) => !isFood(s) || keep.has(s.name));
  }

  out = resequenceTimeline(out, {
    startMin: options.startMin != null ? options.startMin : 9 * 60,
    endMin: options.endMin != null ? options.endMin : 19 * 60,
    bufferMin: options.bufferMin != null ? options.bufferMin : 15,
  });

  return { stops: out, repaired, report: coverageReport(out, options) };
}

module.exports = {
  PHASES,
  phaseAt,
  phaseBonus,
  coverageReport,
  repairMealCoverage,
  resequenceTimeline,
  nearestNeighborReorder,
  isFood,
  isBeach,
  isTemple,
  isScenic,
  isLodgingOrFiller,
  normalizeCat,
};
