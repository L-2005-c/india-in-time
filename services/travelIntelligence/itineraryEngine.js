// itineraryEngine.js — Day-plan ranking & sequencing
// Builds a realistic timed day plan from ranked places + constraints.
const rules = require('../../data/time-intelligence-rules.json');
const { t2m, m2t, getISTParts } = require('./timeEngine');
const { estimateTravel } = require('./trafficEngine');
const { distKm } = require('../../utils/geo');

const DEFAULT_VISIT_MIN = {
  temple: 45, beach: 90, scenic: 40, museum: 75, fort: 60, park: 45,
  garden: 40, waterfall: 50, hill: 60, market: 60, food: 50, monument: 50, default: 45,
};

function visitDurationMin(place) {
  if (Number.isFinite(place.vt) && place.vt > 0) return Math.round(place.vt);
  if (Number.isFinite(place.visitMinutes) && place.visitMinutes > 0) return Math.round(place.visitMinutes);
  return DEFAULT_VISIT_MIN[place.cat] || DEFAULT_VISIT_MIN.default;
}

function mealSlot(nowMin) {
  if (nowMin >= 7 * 60 && nowMin < 10 * 60) return 'breakfast';
  if (nowMin >= 12 * 60 && nowMin < 15 * 60) return 'lunch';
  if (nowMin >= 19 * 60 && nowMin < 22 * 60) return 'dinner';
  return null;
}

/**
 * Build a timed day plan from a list of places.
 * @param {object[]} places
 * @param {object} opts
 * @param {Date} opts.now
 * @param {object|null} opts.weather
 * @param {[number,number]|null} opts.originCoords
 * @param {string[]} opts.personas
 * @param {string|null} opts.tripMode
 * @param {number} opts.startMin - minutes of day to start (default: now or 8:00)
 * @param {number} opts.endMin - hard stop (default: 21:00)
 * @param {number} opts.maxStops
 * @param {number} opts.bufferMin - buffer between stops
 */
function buildDayPlan(places, opts = {}) {
  const now = opts.now || new Date();
  const weather = opts.weather || null;
  const origin = opts.originCoords || null;
  const personas = opts.personas || [];
  const tripMode = opts.tripMode || null;
  const ist = getISTParts(now);
  const bufferMin = opts.bufferMin ?? (rules.buffers?.itineraryBufferMin ?? 20);
  const maxStops = opts.maxStops ?? 8;
  let cursor = Number.isFinite(opts.startMin) ? opts.startMin : Math.max(ist.minutesOfDay, 8 * 60);
  const endMin = Number.isFinite(opts.endMin) ? opts.endMin : 21 * 60;

  const getTI = opts.getTravelIntelligence;
  if (typeof getTI !== 'function') {
    throw new Error('itineraryEngine.buildDayPlan requires opts.getTravelIntelligence');
  }
  // Initial score is used only as a candidate-priority hint. The actual
  // selection is re-scored at each projected arrival time below.
  const scored = (places || []).map((p) => {
    const intel = getTI(p, now, weather, {
      fromCoords: origin, personas, tripMode,
      disableExperienceWindows: true,
    });
    return { place: p, intel, score: intel.visitScore };
  });
  scored.sort((a, b) => b.score - a.score);

  const plan = [];
  const used = new Set();
  let prevCoords = origin;
  const warnings = [];

  // Prefer sunrise spots early, sunset spots near evening, food at meal times
  function priorityBoost(item, atMin) {
    let boost = item.score;
    const p = item.place;
    if (p.is_sunrise_spot && atMin < 9 * 60) boost += 15;
    if (p.is_sunset_spot && atMin >= 16 * 60 && atMin <= 19 * 60) boost += 15;
    if (p.cat === 'food') {
      const slot = mealSlot(atMin);
      if (slot) boost += 20;
      else boost -= 10;
    }
    if (item.intel.isOpenNow === false) boost -= 50;
    if (item.intel.opening?.status === 'CLOSED') boost -= 80;
    return boost;
  }

  while (plan.length < maxStops && cursor < endMin - 30) {
    // Pick best remaining candidate for current cursor time
    let best = null;
    let bestBoost = -Infinity;
    for (const item of scored) {
      if (used.has(item.place.name)) continue;
      // Simulate openness at cursor (rough: use intel opening hours)
      const ot = t2m(item.place.ot || item.intel.openTime || '06:00', 360);
      const ct = t2m(item.place.ct || item.intel.closeTime || '20:00', 1200);
      const overnight = ct <= ot;
      const openAtCursor = overnight ? (cursor >= ot || cursor < ct) : (cursor >= ot && cursor < ct);
      if (!openAtCursor && item.intel.opening?.dataQuality === 'provided') continue;

      // Evaluate the candidate at the projected arrival time, not merely at `now`.
      let previewTravel = { travelMinutes: plan.length === 0 ? 10 : 20, source: 'estimated', trafficLevel: 'Unknown' };
      if (prevCoords && item.place.coords) {
        previewTravel = estimateTravel({
          fromCoords: prevCoords,
          toCoords: item.place.coords,
          departMin: cursor,
          isFirstStop: plan.length === 0,
        });
      }
      const projectedArrivalMin = cursor + (previewTravel.travelMinutes || 15);
      const projectedDate = new Date(now.getTime() + ((projectedArrivalMin - ist.minutesOfDay) * 60 * 1000));
      const arrivalIntel = getTI(item.place, projectedDate, weather, {
        fromCoords: prevCoords,
        personas,
        tripMode,
        isFirstStop: plan.length === 0,
        disableExperienceWindows: true,
      });

      let boost = arrivalIntel.visitScore;
      const p = item.place;
      if (p.is_sunrise_spot && projectedArrivalMin < 9 * 60) boost += 15;
      if (p.is_sunset_spot && projectedArrivalMin >= 16 * 60 && projectedArrivalMin <= 19 * 60) boost += 15;
      if (p.cat === 'food' || /restaurant|cafe|food/i.test(String(p.name||''))) {
        const slot = mealSlot(projectedArrivalMin);
        if (slot) boost += 35;
        else boost -= 22;
      }
      // Prefer user categories when provided
      const prefs = (opts.preferredCategories || []).map((c) => String(c).toLowerCase());
      if (prefs.includes(String(p.cat||'').toLowerCase())) boost += 12;
      if (arrivalIntel.isOpenNow === false) boost -= 80;
      if (arrivalIntel.opening?.status === 'CLOSED') boost -= 100;
      if (prevCoords && item.place.coords) {
        const km = distKm(prevCoords[0], prevCoords[1], item.place.coords[0], item.place.coords[1]);
        if (km > 25) continue;
        if (km < 3) boost += 5;
        else if (km > 12) boost -= 8;
      }
      if (boost > bestBoost) {
        bestBoost = boost;
        best = { ...item, intel: arrivalIntel, projectedArrivalMin, previewTravel };
      }
    }
    if (!best) break;

    // Use the same travel estimate used for projected-arrival scoring so
    // selection and emitted itinerary timings cannot diverge.
    const travel = best.previewTravel || { travelMinutes: plan.length === 0 ? 10 : 20, source: 'estimated', trafficLevel: 'Unknown' };
    const departMin = cursor;
    const arriveMin = best.projectedArrivalMin || (cursor + (travel.travelMinutes || 15));
    const stay = visitDurationMin(best.place);
    const leaveMin = arriveMin + stay;

    if (leaveMin > endMin) {
      // Too late for this stop — try a shorter one or stop planning
      if (stay > 30) {
        // skip this candidate for now
        used.add(best.place.name);
        continue;
      }
      warnings.push(`Stopped planning near ${m2t(cursor)} — remaining stops would exceed end of day.`);
      break;
    }

    const stopIntel = best.intel;

    plan.push({
      order: plan.length + 1,
      name: best.place.name,
      category: best.place.cat || stopIntel.category,
      departAt: m2t(departMin),
      arriveAt: m2t(arriveMin),
      leaveAt: m2t(leaveMin),
      stayMinutes: stay,
      travelMinutes: travel.travelMinutes,
      travelSource: travel.source,
      trafficLevel: travel.trafficLevel,
      distanceKm: travel.distanceKm,
      visitScore: stopIntel.visitScore,
      scoringReference: 'projected_arrival',
      visitLabel: stopIntel.visitLabel,
      crowdLevel: stopIntel.crowdLevel,
      statusLabel: stopIntel.statusLabel,
      isOpenNow: stopIntel.isOpenNow,
      scenicWindow: stopIntel.scenic?.bestScenicWindow || null,
      photographyWindow: stopIntel.scenic?.photographyWindow || null,
      explanation: stopIntel.explanation?.summary || null,
      confidence: stopIntel.confidence,
      notes: buildStopNotes(best.place, arriveMin, stopIntel),
      coords: best.place.coords || null,
    });

    used.add(best.place.name);
    prevCoords = best.place.coords || prevCoords;
    cursor = leaveMin + bufferMin;
  }

  // Alternatives not used
  const alternatives = scored
    .filter((s) => !used.has(s.place.name))
    .slice(0, 5)
    .map((s) => ({
      name: s.place.name,
      visitScore: s.score,
      visitLabel: s.intel.visitLabel,
      reason: s.intel.explanation?.summary || 'Lower ranked for this day window',
    }));

  // 2-opt refinement to reduce travel distance/time
  const refined = twoOptRefine(plan, { originCoords: origin, bufferMin });

  return {
    date: now.toISOString(),
    startAt: refined[0]?.departAt || m2t(cursor),
    endAt: refined.length ? refined[refined.length - 1].leaveAt : m2t(cursor),
    stops: refined,
    stopCount: refined.length,
    alternatives,
    warnings,
    bufferMin,
    optimizer: refined.length >= 3 ? 'projected-arrival + 2-opt' : 'projected-arrival greedy',
    summary: refined.length
      ? `${refined.length}-stop day plan from ${refined[0].departAt} to ${refined[refined.length - 1].leaveAt}`
      : 'No feasible stops for the selected window',
  };
}


/**
 * 2-opt style refinement: try swapping adjacent segments to reduce total travel minutes
 * while preserving openness and end-of-day constraints approximately.
 */
function twoOptRefine(stops, opts = {}) {
  if (!stops || stops.length < 3) return stops;
  const origin = opts.originCoords || null;
  let best = stops.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard < 40) {
    improved = false;
    guard++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (pathTravelCost(candidate, origin) + 0.5 < pathTravelCost(best, origin)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  // Re-number order and recompute times roughly from original start
  if (best.length && stops.length) {
    const startDepart = t2m(stops[0].departAt || '08:00');
    let cursor = startDepart;
    const bufferMin = opts.bufferMin ?? 20;
    let prev = origin;
    return best.map((s, idx) => {
      let travel = s.travelMinutes || 15;
      if (prev && s.coords) {
        try {
          travel = estimateTravel({
            fromCoords: prev,
            toCoords: s.coords,
            departMin: cursor,
            isFirstStop: idx === 0,
          }).travelMinutes || travel;
        } catch (_e) { /* keep */ }
      }
      const arrive = cursor + travel;
      const leave = arrive + (s.stayMinutes || 45);
      const next = {
        ...s,
        order: idx + 1,
        departAt: m2t(cursor),
        arriveAt: m2t(arrive),
        leaveAt: m2t(leave),
        travelMinutes: travel,
      };
      cursor = leave + bufferMin;
      prev = s.coords || prev;
      return next;
    });
  }
  return best;
}

function pathTravelCost(stops, origin) {
  let cost = 0;
  let prev = origin;
  for (const s of stops) {
    if (prev && s.coords && s.coords.length >= 2) {
      try {
        const { distKm } = require('../../utils/geo');
        cost += distKm(prev[0], prev[1], s.coords[0], s.coords[1]);
      } catch (_e) {
        cost += s.travelMinutes || 20;
      }
    } else {
      cost += s.travelMinutes || 20;
    }
    prev = s.coords || prev;
  }
  return cost;
}


function buildStopNotes(place, arriveMin, intel) {
  const notes = [];
  if (place.is_sunrise_spot && arriveMin < 9 * 60) notes.push('Sunrise window');
  if (place.is_sunset_spot && arriveMin >= 16 * 60) notes.push('Sunset / golden hour');
  if (place.cat === 'food') {
    const slot = mealSlot(arriveMin);
    if (slot) notes.push(`${slot.charAt(0).toUpperCase() + slot.slice(1)} stop`);
  }
  if (intel.crowd?.level === 'High' || intel.crowd?.level === 'Very High') notes.push('Expect crowds');
  if (intel.weather?.warnings?.length) notes.push(intel.weather.warnings[0]);
  return notes;
}

/**
 * Dynamic advice based on measurable signals for a single place "right now".
 */
function dynamicAdvice(intel, _opts = {}) {
  const actions = [];
  if (!intel) return { actions: ['Insufficient data'], headline: 'Unknown' };

  if (intel.isOpenNow === false) {
    if (intel.minutesToOpen != null && intel.minutesToOpen <= 90) {
      actions.push(`Wait ${intel.minutesToOpen} minutes — opens soon`);
    } else {
      actions.push('Avoid now — currently closed');
      if (intel.opening?.openTime) actions.push(`Try after ${intel.opening.openTime}`);
    }
  } else if (intel.opening?.status === 'CLOSING_SOON') {
    actions.push(`Hurry — closes in ${intel.minutesToClose} min`);
  }

  if (intel.visitScore >= 75 && intel.isOpenNow) {
    actions.push('Visit now — conditions are favourable');
  } else if (intel.visitScore < 40) {
    actions.push('Consider postponing — conditions are poor');
  }

  if (intel.crowd?.level === 'Very High' || intel.crowd?.level === 'High') {
    actions.push('High crowd — consider an alternative or a later slot');
  }
  if (intel.weather?.suitability === 'Poor' || intel.weather?.suitability === 'Very Poor') {
    actions.push('Weather unfavourable for outdoor activity');
  }
  if (intel.scenic?.bestScenicWindow && intel.inGoldenHour?.any) {
    actions.push('Golden-hour window is active — good for photography');
  }
  if (intel.arrival?.recommendedDeparture) {
    actions.push(`If traveling, leave around ${intel.arrival.recommendedDeparture}`);
  }

  const headline = actions[0] || intel.statusLabel || 'See details';
  return { headline, actions, visitScore: intel.visitScore, confidence: intel.confidence };
}


/**
 * Lightweight multi-day advice: suggest moving outdoor-heavy stops when today is poor.
 * Does not invent weather — uses provided intel signals only.
 */
function multiDayAdvice(placesIntel = [], opts = {}) {
  const suggestions = [];
  for (const item of placesIntel) {
    const intel = item.intel || item;
    const name = item.name || intel.name || 'Place';
    const outdoor = ['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument'].includes(intel.category || item.cat);
    const wx = intel.weather;
    const crowd = intel.crowd || {};
    if (outdoor && wx && (wx.suitability === 'Poor' || wx.suitability === 'Very Poor')) {
      suggestions.push({
        place: name,
        action: 'reschedule',
        when: 'tomorrow morning',
        reason: `Outdoor conditions poor today (${wx.suitability}). Prefer a cooler/clearer window.`,
      });
    } else if (crowd.level === 'Very High' && outdoor) {
      suggestions.push({
        place: name,
        action: 'reschedule',
        when: 'early tomorrow or later evening',
        reason: `Very high predicted crowd today.`,
      });
    } else if (intel.visitScore != null && intel.visitScore < 40 && intel.isOpenNow === false) {
      suggestions.push({
        place: name,
        action: 'defer',
        when: 'next open window',
        reason: intel.statusLabel || 'Currently closed with low visit score',
      });
    }
  }
  return {
    suggestions,
    headline: suggestions.length
      ? `${suggestions.length} stop(s) may be better on another day/window`
      : 'No multi-day reschedule suggested from current signals',
  };
}

module.exports = {
  buildDayPlan,
  dynamicAdvice,
  multiDayAdvice,
  visitDurationMin,
};

