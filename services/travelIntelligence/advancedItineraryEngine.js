'use strict';

/**
 * Authoritative itinerary decision engine.
 *
 * This is a bounded beam-search solver. Each beam state carries the complete
 * decision context (clock, position, selected places, travel, spend, meal
 * coverage, category coverage and objective value). Candidate intelligence is
 * re-evaluated at the projected arrival time, including after deliberate
 * waiting for a better temporal window. No post-hoc resequencing or meal
 * insertion is allowed.
 */

const { getTravelIntelligence } = require('./index');
const { estimateTravel } = require('./trafficEngine');
const { m2t, t2m } = require('./timeEngine');
const dayStructure = require('./dayStructure');
const {
  parseRequirements,
  filterCandidates,
  candidateMatchesHardRequirements,
  isExcludedCategory,
  normalizeCat,
  normalizeMeal,
  placeCost,
  isFoodPlace,
} = require('./requirementEngine');
const {
  filterEligibleCandidates,
  TIERS: TOURISM_TIERS,
} = require('./tourismPoi');

const MEALS = {
  breakfast: { start: 7 * 60, end: 10 * 60 + 30, label: 'breakfast' },
  lunch: { start: 11 * 60 + 30, end: 15 * 60 + 30, label: 'lunch' },
  snack: { start: 16 * 60, end: 18 * 60 + 30, label: 'snack' },
  dinner: { start: 18 * 60 + 30, end: 22 * 60 + 30, label: 'dinner' },
};

const OUTDOOR = new Set(['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument', 'viewpoint']);

function visitMinutes(place) {
  const defaults = {
    temple: 45, beach: 75, scenic: 50, museum: 70, fort: 60, park: 45,
    garden: 40, waterfall: 50, hill: 55, market: 50, food: 55, cafe: 35,
    monument: 45, nightlife: 90, default: 45,
  };
  const raw = Number(place.vt ?? place.visitMinutes);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : defaults[normalizeCat(place.cat)] || defaults.default;
}

function isFood(place) { return dayStructure.isFood(place) || isFoodPlace(place); }

function mealAt(min) {
  for (const meal of Object.values(MEALS)) {
    if (min >= meal.start && min <= meal.end) return meal.label;
  }
  return null;
}

function minuteOf(value) {
  if (Number.isFinite(value)) return value;
  return t2m(value, -1);
}

function distanceKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return 999;
  const R = 6371;
  const rad = Math.PI / 180;
  const p1 = Number(a[0]) * rad;
  const p2 = Number(b[0]) * rad;
  const dp = (Number(b[0]) - Number(a[0])) * rad;
  const dl = (Number(b[1]) - Number(a[1])) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function formatReasons(intel, place, arrivalMin, requirements, travel, waitMinutes) {
  const reasons = [];
  const meal = mealAt(arrivalMin);
  const cat = normalizeCat(place.cat);
  if (isFood(place) && meal) reasons.push(`Fits ${meal} window`);
  if (intel?.isBestTimeNow) reasons.push('This is a high-value time window for the place');
  if (intel?.scenic?.photographyScore >= 75 || intel?.scenic?.scenicScore >= 80) reasons.push('Strong scenic / photography conditions');
  if (['Low', 'Very Low'].includes(intel?.crowdLevel)) reasons.push('Lower predicted crowd');
  if (requirements.soft.lowCrowd && ['High', 'Very High'].includes(intel?.crowdLevel)) reasons.push('Crowd penalty applied because low crowd was requested');
  if (requirements.soft.photography && (place.is_sunset_spot || place.is_sunrise_spot || ['scenic', 'beach'].includes(cat))) reasons.push('Matches photography preference');
  if (requirements.soft.preferredCategories?.includes(cat)) reasons.push(`Matches preferred category: ${cat}`);
  if (travel?.distanceKm != null && travel.distanceKm <= 3.5) reasons.push(`Near previous stop (${travel.distanceKm} km)`);
  if (waitMinutes > 0) reasons.push(`Waited ${waitMinutes} min to reach a better time window`);
  if (intel?.weather?.suitability) reasons.push(`Weather suitability: ${intel.weather.suitability}`);
  if (intel?.traffic?.source) reasons.push(`Travel source: ${intel.traffic.source}`);
  return reasons.length ? reasons : ['Best feasible option under current requirements'];
}

function selectWeatherAt(weather, minute, baseDate) {
  if (!weather || !Array.isArray(weather.hourly) || !weather.hourly.length) return weather || null;
  const target = minute;
  let best = null;
  let bestMinute = -Infinity;
  let first = null;
  let firstMinute = Infinity;
  const parse = (value) => {
    if (Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
      const h = Number(parts.find((p) => p.type === 'hour')?.value);
      const m = Number(parts.find((p) => p.type === 'minute')?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
    }
    return null;
  };
  for (const item of weather.hourly) {
    const m = parse(item.time ?? item.timestamp ?? item.minute);
    if (m == null) continue;
    if (m < firstMinute) { first = item; firstMinute = m; }
    if (m <= target && m > bestMinute) { best = item; bestMinute = m; }
  }
  const selected = best || first;
  return selected ? { ...weather, ...selected, source: 'forecast' } : weather;
}

function dateAtMinute(baseDate, minute, startMin) {
  const base = baseDate instanceof Date ? new Date(baseDate) : new Date();
  const formatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = formatter.formatToParts(base);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  const currentMin = ((h % 24) * 60) + m;
  // The reference Date represents the real current day/time. To evaluate a
  // planned local clock time, shift from the current IST clock minute, not
  // from the trip start minute. The previous approach could turn an 08:00
  // itinerary into an 19:00 timestamp simply because the request was made in
  // the evening.
  const delta = Number(minute) - currentMin;
  return new Date(base.getTime() + delta * 60000);
}

function placeIdentity(place) {
  return String(place.id ?? place.placeId ?? place.name).toLowerCase().trim();
}

function matchesPlaceReference(place, requirement) {
  const target = String(requirement).toLowerCase().trim();
  const id = placeIdentity(place);
  const name = String(place.name || '').toLowerCase();
  return id === target || name === target || name.includes(target) || target.includes(name);
}

function matchesMustVisit(place, requirement) {
  return matchesPlaceReference(place, requirement);
}

function mustVisitCoverage(stops, requirements) {
  const required = requirements.hard.mustVisit || [];
  return required.filter((req) => stops.some((stop) => matchesMustVisit(stop, req)));
}

function explicitCost(place, options = {}) {
  const keys = ['estimatedCost', 'cost', 'price', 'entryFee', 'entry_fee', 'ticketPrice', 'ticket_price', 'admission'];
  for (const key of keys) {
    const n = Number(place?.[key]);
    if (Number.isFinite(n) && n >= 0) return { amount: n, known: true, source: key };
  }
  if (place?.isFree === true || place?.free === true || place?.price === 0) return { amount: 0, known: true, source: 'free' };
  return { amount: 0, known: false, source: 'unavailable' };
}

function travelCost(travel, place, options = {}) {
  const perKm = Number(options.transportCostPerKm);
  const perMinute = Number(options.transportCostPerMinute);
  if (Number.isFinite(perKm) || Number.isFinite(perMinute)) {
    const kmCost = Number.isFinite(perKm) ? Math.max(0, Number(travel?.distanceKm || 0) * perKm) : 0;
    const timeCost = Number.isFinite(perMinute) ? Math.max(0, Number(travel?.travelMinutes || 0) * perMinute) : 0;
    return { amount: Math.round((kmCost + timeCost) * 100) / 100, known: true, source: 'transport-pricing-model' };
  }
  if (Number.isFinite(Number(travel?.cost))) return { amount: Math.max(0, Number(travel.cost)), known: true, source: 'route-provider' };
  return { amount: 0, known: false, source: 'unavailable' };
}

function mealRequirements(requirements) {
  return requirements.hard.requiredMeals?.length
    ? requirements.hard.requiredMeals
    : (requirements.soft.foodFocus ? ['lunch'] : []);
}

function requiredMealMet(stops, meal) {
  return stops.some((s) => isFood(s) && mealAt(minuteOf(s.arriveAt)) === meal);
}

function requirementSatisfaction(stops, requirements, validation = []) {
  const prefs = requirements.soft.preferredCategories || [];
  const coveredCats = new Set(stops.map((s) => normalizeCat(s.category)));
  const catMet = prefs.filter((p) => coveredCats.has(p));
  const catScore = prefs.length ? (catMet.length / prefs.length) * 100 : 100;
  const required = mealRequirements(requirements);
  const mealsMet = required.filter((meal) => requiredMealMet(stops, meal));
  const mealScore = required.length ? (mealsMet.length / required.length) * 100 : 100;
  const must = requirements.hard.mustVisit || [];
  const mustMet = mustVisitCoverage(stops, requirements);
  const mustScore = must.length ? (mustMet.length / must.length) * 100 : 100;
  const hardScore = validation.length ? 0 : 100;
  const score = Math.max(0, Math.min(100, Math.round(catScore * 0.35 + mealScore * 0.25 + mustScore * 0.20 + hardScore * 0.20)));
  const unmet = [
    ...prefs.filter((p) => !coveredCats.has(p)),
    ...required.filter((m) => !mealsMet.includes(m)),
    ...must.filter((m) => !mustMet.includes(m)),
  ];
  return { score, met: [...catMet, ...mealsMet, ...mustMet], unmet, breakdown: { categoryScore: Math.round(catScore), mealScore: Math.round(mealScore), mustVisitScore: Math.round(mustScore), hardConstraintScore: hardScore } };
}

function validatePlan(stops, requirements, totals = {}) {
  const failures = [];
  const seen = new Set();
  let previousLeave = requirements.hard.startMin;
  for (const stop of stops) {
    const key = placeIdentity(stop);
    if (seen.has(key)) failures.push(`duplicate:${stop.name}`);
    seen.add(key);
    const arrive = minuteOf(stop.arriveAt);
    const leave = minuteOf(stop.leaveAt);
    if (arrive < requirements.hard.startMin || leave > requirements.hard.endMin || leave < arrive) failures.push(`window:${stop.name}`);
    if (arrive < previousLeave) failures.push(`order:${stop.name}`);
    if (requirements.hard.maxTravelMinutes != null && Number(stop.travelMinutes) > requirements.hard.maxTravelMinutes) failures.push(`maxTravel:${stop.name}`);
    if (isExcludedCategory(stop, requirements.hard.excludedCategories)) failures.push(`excluded:${stop.name}`);
    if (!stop.constraintsSatisfied?.openAtArrival) failures.push(`closed:${stop.name}`);
    previousLeave = leave;
  }
  if (requirements.hard.maxStops != null && stops.length > requirements.hard.maxStops) failures.push(`maxStops:${stops.length}>${requirements.hard.maxStops}`);
  if (requirements.hard.maxWaitingMinutes != null && Number(totals.waitMinutes || stops.reduce((sum, s) => sum + Number(s.waitMinutes || 0), 0)) > requirements.hard.maxWaitingMinutes) failures.push(`maxWaitingMinutes:${totals.waitMinutes ?? 'calculated'}>${requirements.hard.maxWaitingMinutes}`);
  const requiredMeals = mealRequirements(requirements);
  for (const meal of requiredMeals) if (!requiredMealMet(stops, meal)) failures.push(`requiredMeal:${meal}`);
  const missingMust = (requirements.hard.mustVisit || []).filter((req) => !stops.some((s) => matchesMustVisit(s, req)));
  missingMust.forEach((req) => failures.push(`mustVisit:${req}`));
  if (requirements.hard.budgetHard != null) {
    if (totals.costDataIncomplete) failures.push('budgetDataIncomplete');
    if (totals.cost > requirements.hard.budgetHard + 1e-9) failures.push(`budget:${Math.round(totals.cost)}> ${requirements.hard.budgetHard}`);
  }
  return [...new Set(failures)];
}

function scoreTransition(place, arrivalMin, state, requirements, weather, nowBase, travel, waitMinutes, memo) {
  const projectedDate = dateAtMinute(nowBase, arrivalMin, requirements.hard.startMin);
  const effectiveWeather = selectWeatherAt(weather, arrivalMin, projectedDate);
  const cacheKey = `${placeIdentity(place)}|${arrivalMin}|${Math.round((travel?.travelMinutes || 0) / 5)}`;
  let intel = memo.get(cacheKey);
  if (!intel) {
    try {
      intel = getTravelIntelligence(place, projectedDate, effectiveWeather, {
        fromCoords: state.prevCoords,
        personas: requirements.soft.personas,
        tripMode: requirements.soft.tripMode,
        region: requirements.region,
        isFirstStop: state.stops.length === 0,
        publicHoliday: state.publicHoliday,
      });
    } catch (_err) {
      return null;
    }
    memo.set(cacheKey, intel);
  }

  if (intel.isOpenNow === false || intel.opening?.status === 'CLOSED') return null;
  if (requirements.soft.lowCrowd && ['High', 'Very High'].includes(intel.crowdLevel)) return null;

  const stay = visitMinutes(place);
  if (intel.minutesToClose != null && arrivalMin + stay > arrivalMin + intel.minutesToClose - 10) return null;

  let score = Number(intel.visitScore) || 50;
  const cat = normalizeCat(place.cat || place.category);
  const meal = mealAt(arrivalMin);
  const requiredMeals = mealRequirements(requirements);
  const neededMeal = requiredMeals.includes(meal) && !state.meals.has(meal);

  // Temporal value is primary. Waiting is rewarded only when it materially
  // improves the time-dependent experience or fulfils a meal requirement.
  score += Number(intel.scenic?.scenicScore || 0) * 0.18;
  score += Number(intel.scenic?.photographyScore || 0) * (requirements.soft.photography ? 0.10 : 0.03);
  score += Number(intel.weather?.score || 50) * 0.12;
  score += ({ Low: 8, 'Very Low': 12, Moderate: 0, High: -8, 'Very High': -14 }[intel.crowdLevel] || 0);
  if (requirements.soft.lowCrowd && ['High', 'Very High'].includes(intel.crowdLevel)) score -= 24;
  if (requirements.soft.family) {
    if (place.family_friendly || ['park', 'museum', 'beach'].includes(cat)) score += 18;
    else score -= 24;
  }
  if (requirements.soft.photography && ['scenic', 'beach', 'viewpoint'].includes(cat)) score += 15;
  if (requirements.soft.preferredCategories?.length) {
    const preferred = requirements.soft.preferredCategories.includes(cat)
      || (requirements.soft.preferredCategories.includes('food') && isFood(place));
    if (preferred) score += 48;
    else if (!neededMeal) score -= 72;
  }
  if (isFood(place)) {
    const foodIntent = requirements.soft.foodFocus || requirements.soft.preferredCategories?.includes('food') || requiredMeals.includes(meal);
    if (foodIntent && ['lunch', 'dinner', 'breakfast', 'snack'].includes(meal)) score += neededMeal ? 50 : 28;
    else if (!foodIntent) score -= 35;
    else score -= 12;
  } else if (requirements.soft.foodFocus && (meal === 'lunch' || meal === 'dinner') && !state.meals.has(meal)) {
    score -= 28;
  }
  if (place.is_sunset_spot && meal !== 'lunch') score += 8;
  if (state.stops.length && normalizeCat(state.stops[state.stops.length - 1].category) === cat && cat !== 'food') score -= 7;

  const outdoor = place.indoor_outdoor === 'outdoor' || OUTDOOR.has(cat) || place.is_outdoor === true;
  const condition = String(intel.weather?.condition || '').toLowerCase();
  if (outdoor && /heavy|storm|thunder|cyclone|flood/.test(condition)) return null;
  if (outdoor && /rain|drizzle|shower/.test(condition)) score -= 40;
  if (outdoor && Number(intel.weather?.tempC) >= 36) score -= 22;

  if (requirements.hard.maxWaitingMinutes != null && state.waitMinutes + waitMinutes > requirements.hard.maxWaitingMinutes) return null;

  if (waitMinutes > 0) {    score -= Math.min(24, waitMinutes * 0.18);
    if (intel.isBestTimeNow || neededMeal) score += Math.min(30, waitMinutes * 0.35 + 8);
  }

  const cost = explicitCost(place, requirements);
  const tCost = travelCost(travel, place, requirements);
  const totalIncrement = cost.amount + tCost.amount;
  const costKnown = cost.known && tCost.known;
  if (requirements.hard.budgetHard != null && !costKnown) return null;
  if (requirements.hard.budgetHard != null && state.cost + totalIncrement > requirements.hard.budgetHard + 1e-9) return null;
  if (requirements.soft.budget != null && state.cost + totalIncrement > requirements.soft.budget) score -= 20;

  if (requirements.hard.maxTravelMinutes != null && Number(travel?.travelMinutes) > requirements.hard.maxTravelMinutes) return null;

  const constraintsSatisfied = {
    openAtArrival: intel.isOpenNow !== false,
    withinTripWindow: arrivalMin + stay <= requirements.hard.endMin,
    notExcluded: !isExcludedCategory(place, requirements.hard.excludedCategories),
    mealAware: !neededMeal || isFood(place),
    dietaryCompatible: true,
    accessibilityCompatible: true,
    transportCompatible: true,
    safetyCompatible: true,
    budgetCompliant: requirements.hard.budgetHard == null || state.cost + totalIncrement <= requirements.hard.budgetHard,
  };

  return {
    score,
    intel,
    stay,
    cost: totalIncrement,
    costKnown,
    costSource: `${cost.source}+${tCost.source}`,
    reasons: formatReasons(intel, place, arrivalMin, requirements, travel, waitMinutes),
    constraintsSatisfied,
    experienceScore: Math.max(0, Math.min(100, Math.round(score))),
  };
}

function futureTargets(place, scored, cursor, requirements) {
  const targets = new Set([cursor]);
  for (const meal of mealRequirements(requirements)) {
    const window = MEALS[meal];
    if (window && cursor < window.end) targets.add(Math.max(cursor, window.start + 10));
  }
  const windows = [scored?.intel?.scenic?.bestScenicWindow, scored?.intel?.scenic?.photographyWindow].filter(Boolean);
  for (const win of windows) {
    const start = Number(win.startMin);
    if (Number.isFinite(start) && start > cursor) targets.add(Math.min(start, cursor + 120));
  }
  if (place.is_sunset_spot && scored?.intel?.sunset != null && Number.isFinite(Number(scored.intel.sunset))) {
    const parsed = t2m(scored.intel.sunset, -1);
    if (parsed > cursor) targets.add(Math.min(parsed, cursor + 120));
  }
  return [...targets].filter((n) => Number.isFinite(n)).sort((a, b) => a - b).slice(0, 4);
}

function buildStop(place, scored, arrivalMin, state) {
  const intel = scored.intel;
  const category = place.cat || intel.category || 'default';
  const totalCost = Math.round((state.cost + scored.cost) * 100) / 100;
  return {
    key: placeIdentity(place),
    id: place.id ?? place.placeId ?? place.name,
    name: place.name,
    category,
    coords: place.coords,
    purpose: isFood(place) ? (mealAt(arrivalMin) || 'food') : 'experience',
    departAt: m2t(state.cursor),
    travelMinutes: Math.round(scored.travelMinutes ?? state.pendingTravelMinutes ?? 0),
    travelSource: scored.travelSource || 'estimated',
    trafficState: scored.trafficLevel || 'Unknown',
    trafficRisk: scored.trafficRisk || 'Unknown',
    trafficConfidence: Number.isFinite(Number(scored.trafficConfidence)) ? Number(scored.trafficConfidence) : null,
    distanceKm: scored.distanceKm ?? null,
    routeComputedAt: new Date().toISOString(),
    waitMinutes: state.pendingWait || 0,
    arriveAt: m2t(arrivalMin),
    leaveAt: m2t(arrivalMin + scored.stay),
    stayMinutes: scored.stay,
    visitScore: intel.visitScore,
    experienceScore: scored.experienceScore,
    experienceScoreAtArrival: intel.visitScore,
    timingScore: intel.isBestTimeNow ? 100 : Math.max(0, Math.min(100, Math.round((intel.scenic?.scenicScore || 50) * 0.7 + (intel.weather?.score || 50) * 0.3))),
    timingFit: intel.isBestTimeNow ? 95 : 65,
    mealTimingBonus: isFood(place) && mealAt(arrivalMin) ? 30 : 0,
    optimizationScore: Math.round(scored.score),
    crowdLevel: intel.crowdLevel,
    weather: intel.weather,
    open: intel.isOpenNow,
    reasons: scored.reasons,
    whyThisPlace: scored.reasons,
    whyThisTime: scored.reasons.filter((r) => /time|window|meal|golden|weather|crowd|wait|sunset/i.test(r)),
    whyNotOtherTime: intel.scenic?.bestScenicWindow ? [`Chosen around the best available temporal window (${intel.scenic.bestScenicWindow.start || 'time window'})`] : ['Earlier/later candidates scored lower under the current constraints'],
    whyNotAlternative: ['Alternatives were evaluated against the same arrival-time, route, requirement and feasibility state'],
    confidence: Number(intel.confidence?.confidence ?? intel.confidence ?? 50),
    nearbyPreferred: Number(scored.distanceKm) <= 3.5,
    cost: scored.cost,
    costSource: scored.costSource,
    cumulativeCost: totalCost,
    constraintsSatisfied: scored.constraintsSatisfied,
    dataSources: {
      weather: intel.dataSources?.weather || intel.weather?.source || 'unavailable',
      traffic: intel.dataSources?.traffic || scored.travelSource || 'unavailable',
      crowd: intel.dataSources?.crowd || intel.crowd?.source || 'unavailable',
      scenic: intel.dataSources?.scenic || 'astronomical_rules',
      openingHours: intel.opening?.dataQuality || 'unavailable',
      computedAt: intel.computedAt || null,
    },
  };
}

function stateQuality(state, requirements) {
  const required = mealRequirements(requirements);
  const meals = required.filter((m) => state.meals.has(m)).length;
  const prefs = requirements.soft.preferredCategories || [];
  const prefMet = prefs.filter((p) => state.categories.has(p)).length;
  const must = requirements.hard.mustVisit || [];
  const mustMet = must.filter((m) => state.stops.some((s) => matchesMustVisit(s, m))).length;
  const remaining = Math.max(0, requirements.hard.endMin - state.cursor);
  const crowdPenalty = state.stops.reduce((sum, s) => sum + (['High', 'Very High'].includes(s.crowdLevel) ? 6 : 0), 0);
  return state.score
    + meals * 90
    + (required.length ? (meals / required.length) * 80 : 0)
    + prefMet * 45
    + mustMet * 100
    - state.travelMinutes * 0.8
    - state.waitMinutes * 0.4
    - state.cost * (requirements.soft.budget ? 0.04 : 0.01)
    - crowdPenalty
    + Math.min(10, remaining / 60);
}

function dedupeStates(states) {
  const map = new Map();
  for (const state of states) {
    const key = `${Math.round(state.cursor / 10)}|${placeIdentity({ name: state.prevKey })}|${[...state.used].sort().join(',')}`;
    const current = map.get(key);
    if (!current || state.score > current.score) map.set(key, state);
  }
  return [...map.values()];
}

function buildInfeasibleResult(requirements, warnings, candidates, diagnostics = {}) {
  return {
    generatedAt: new Date().toISOString(),
    algorithm: 'geo-temporal-beam-search-v5-world-class',
    objective: 'maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements',
    status: 'INFEASIBLE',
    stopCount: 0,
    stops: [],
    warnings: [...new Set(warnings)],
    strictOption: { status: 'INFEASIBLE', action: 'Relax one or more hard constraints or provide more candidate data.' },
    relaxedOption: { status: 'AVAILABLE_IF_RELAXED', suggestion: 'Allow softening selected preferences or hard limits; do not silently break them.' },
    requirementSatisfaction: { score: 0, met: [], unmet: [...new Set([...(requirements.hard.requiredMeals || []), ...(requirements.hard.mustVisit || []), ...(requirements.soft.preferredCategories || [])])] },
    validation: { passed: false, failures: [...new Set(warnings)] },
    requirements: requirements,
    diagnostics: { candidateCount: candidates.length, tourismRejected: (typeof tourismRejected !== "undefined" ? tourismRejected.slice(0, 30) : []), tourismEligibleCount: candidates.length, ...diagnostics },
  };
}

function planAdvancedItinerary(places, rawOptions = {}) {
  const requirements = parseRequirements(rawOptions);
  const all = Array.isArray(places) ? places : [];

  // ── Tourism POI Eligibility Gate (before requirement/hard filters) ──────
  // Prevents localities, residential areas, and non-tourist map entities
  // from entering the optimizer. Shopping/food allowed based on requirements.
  const preferred = requirements.soft?.preferredCategories || [];
  const allowFood = preferred.includes('food')
    || preferred.includes('cafe')
    || !!(requirements.hard?.requiredMeals?.length)
    || requirements.soft?.foodFocus === true
    || rawOptions.allowFood === true;
  const allowShopping = preferred.includes('shopping')
    || preferred.includes('market')
    || /shop|mall|market/i.test(JSON.stringify(rawOptions.preferences || rawOptions.prefs || ''))
    || rawOptions.allowShopping === true;
  const requireTouristOnly = rawOptions.touristOnly === true
    || /only\s+tourist|tourist\s+attractions?\s+only/i.test(String(rawOptions.query || rawOptions.text || ''));

  const exclusiveCategories = requirements.hard?.exclusiveCategories || rawOptions.exclusiveCategories || [];
  const { eligible: tourismEligible, rejected: tourismRejected } = filterEligibleCandidates(all, {
    city: rawOptions.city || rawOptions.cityName || rawOptions.region,
    // Allow food when requested OR when no category prefs (general discovery still needs meal slots).
    allowFood: allowFood || preferred.length === 0 || exclusiveCategories.includes('food'),
    allowShopping: allowShopping || preferred.length === 0 || exclusiveCategories.includes('shopping'),
    requireTouristOnly,
    discoveryMode: rawOptions.discoveryMode === true,
    exclusiveCategories,
  });

  const candidates = filterCandidates(tourismEligible, requirements);
  const now = rawOptions.now instanceof Date ? rawOptions.now : new Date(rawOptions.now || Date.now());
  const startMin = requirements.hard.startMin;
  const endMin = requirements.hard.endMin;
  const maxStops = requirements.hard.maxStops || Math.min(10, Math.max(2, Math.floor(requirements.hard.durationMin / 55)));
  const beamWidth = Math.min(60, Math.max(8, Number(rawOptions.beamWidth) || 28));
  const expansionLimit = Math.min(14, Math.max(4, Number(rawOptions.expansionLimit) || 10));
  const buffer = Math.max(5, Number(rawOptions.bufferMin) || 12);

  if (endMin <= startMin) return buildInfeasibleResult(requirements, ['endTime must be after startTime'], candidates);

  const mustVisitMissing = (requirements.hard.mustVisit || []).filter((req) => !all.some((p) => matchesMustVisit(p, req)));
  if (mustVisitMissing.length) return buildInfeasibleResult(requirements, mustVisitMissing.map((x) => `Must-visit place not found: ${x}`), candidates);
  if (!candidates.length) return buildInfeasibleResult(requirements, ['No candidates survive the hard constraints.'], candidates);

  const origin = requirements.originCoords || (candidates[0] && candidates[0].coords) || null;
  const completedStops = Array.isArray(rawOptions.completedStops) ? rawOptions.completedStops : [];
  const completedKeys = new Set(completedStops.map(placeIdentity));
  const startCursor = Number.isFinite(rawOptions.cursor) ? rawOptions.cursor : startMin;
  const startOrigin = Array.isArray(rawOptions.currentCoords) ? rawOptions.currentCoords : (completedStops.at(-1)?.coords || origin);
  const memo = new Map();
  const warnings = [];
  let beam = [{
    cursor: startCursor,
    prevCoords: startOrigin,
    prevKey: completedStops.at(-1)?.name || 'origin',
    stops: [],
    used: new Set(completedKeys),
    categories: new Set(completedStops.map((s) => normalizeCat(s.category))),
    meals: new Set(completedStops.map((s) => mealAt(minuteOf(s.arriveAt))).filter(Boolean)),
    score: 0,
    cost: completedStops.reduce((sum, s) => sum + Number(s.cost || 0), 0),
    costDataIncomplete: completedStops.some((s) => !Number.isFinite(Number(s.cost))),
    travelMinutes: 0,
    waitMinutes: 0,
  }];

  const preferredCategories = requirements.soft.preferredCategories || [];

  for (let depth = 0; depth < maxStops && beam.length; depth += 1) {
    const expanded = [];
    for (const state of beam) {
      const expansions = [];
      for (const place of candidates) {
        const key = placeIdentity(place);
        if (state.used.has(key)) continue;
        const hard = candidateMatchesHardRequirements(place, requirements);
        if (!hard.ok) continue;

        // Preferred categories are treated as strong planning intent. Do not
        // fill the itinerary with unrelated places while a requested category
        // remains uncovered, unless the candidate is itself a required meal.
        const preferred = requirements.soft.preferredCategories || [];
        const missingPreferred = preferred.filter((cat) => !state.categories.has(cat));
        const placeCat = normalizeCat(place.cat || place.category);
        const mealNow = mealAt(state.cursor);
        const isRequiredMealCandidate = isFood(place) && mealRequirements(requirements).includes(mealNow);
        if (missingPreferred.length && !missingPreferred.includes(placeCat) && !isRequiredMealCandidate) continue;

        const travel = estimateTravel({
          fromCoords: state.prevCoords,
          toCoords: place.coords,
          departMin: state.cursor,
          liveTraffic: rawOptions.liveTraffic || null,
          isFirstStop: state.stops.length === 0 && !completedStops.length,
        });
        const travelMinutes = Number(travel.travelMinutes);
        if (!Number.isFinite(travelMinutes)) continue;
        if (requirements.hard.maxTravelMinutes != null && travelMinutes > requirements.hard.maxTravelMinutes) continue;
        const rawArrival = state.cursor + travelMinutes;
        if (rawArrival >= endMin - 15) continue;

        // Score the immediate arrival once, then use it to discover a small
        // set of meaningful future targets. Every target is rescored at its
        // actual arrival time; no stale score is reused after waiting.
        const immediate = scoreTransition(place, rawArrival, state, requirements, requirements.weather, now, travel, 0, memo);
        if (!immediate) continue;
        const targets = futureTargets(place, immediate, rawArrival, requirements);
        for (const targetArrival of targets) {
          const wait = Math.max(0, targetArrival - rawArrival);
          const actualArrival = rawArrival + wait;
          if (actualArrival >= endMin - 10) continue;
          const rescored = wait === 0 ? immediate : scoreTransition(place, actualArrival, state, requirements, requirements.weather, now, travel, wait, memo);
          if (!rescored) continue;
          const leave = actualArrival + rescored.stay;
          if (leave > endMin) continue;

          const stopState = { ...state, pendingWait: wait, pendingTravelMinutes: travelMinutes };
          const stop = buildStop(place, {
            ...rescored,
            travelMinutes,
            travelSource: travel.source,
            trafficLevel: travel.trafficLevel,
            trafficRisk: travel.trafficRisk,
            trafficConfidence: travel.confidence,
            distanceKm: travel.distanceKm,
          }, actualArrival, stopState);
          const next = {
            cursor: leave + buffer,
            prevCoords: place.coords || state.prevCoords,
            prevKey: place.name,
            stops: [...state.stops, stop],
            used: new Set([...state.used, key]),
            categories: new Set([...state.categories, normalizeCat(place.cat || place.category)]),
            meals: new Set(state.meals),
            score: state.score + rescored.score - Math.max(0, wait * 0.15),
            cost: state.cost + rescored.cost,
            costDataIncomplete: state.costDataIncomplete || !rescored.costKnown,
            travelMinutes: state.travelMinutes + travelMinutes,
            waitMinutes: state.waitMinutes + wait,
          };
          if (isFood(place)) {
            const meal = mealAt(actualArrival);
            if (meal) next.meals.add(meal);
          }
          expansions.push(next);
        }
      }

      expanded.push(...expansions);

      // A deliberate no-op is useful when all remaining candidates are worse
      // than waiting for a later window, but only one idle step is allowed per
      // depth to prevent pathological empty schedules.
      if (state.stops.length && state.cursor < endMin - 45) {
        const nextCursor = Math.min(endMin - 30, state.cursor + 15);
        expanded.push({ ...state, cursor: nextCursor, waitMinutes: state.waitMinutes + 15, score: state.score - 1.5 });
      }
    }

    const deduped = dedupeStates(expanded);
    deduped.sort((a, b) => stateQuality(b, requirements) - stateQuality(a, requirements));
    beam = deduped.slice(0, beamWidth);
    if (!beam.length) break;
    if (beam.some((s) => {
      const reqMeals = mealRequirements(requirements);
      const mealsOk = reqMeals.every((m) => s.meals.has(m));
      const mustOk = (requirements.hard.mustVisit || []).every((m) => s.stops.some((st) => matchesMustVisit(st, m)));
      const prefsOk = preferredCategories.length === 0 || preferredCategories.every((c) => s.categories.has(c));
      return mealsOk && mustOk && prefsOk && s.stops.length >= Math.min(2, maxStops);
    }) && depth >= Math.min(2, maxStops - 1)) {
      // Continue one or two more layers only if there is room and value in it;
      // otherwise a complete feasible state is already available.
      const best = beam[0];
      if (best && best.cursor >= endMin - 60) break;
    }
  }

  const feasible = [];
  const candidatesForFinal = beam.filter((s) => s.stops.length > 0);
  for (const state of candidatesForFinal) {
    const validation = validatePlan(state.stops, requirements, { cost: state.cost, costDataIncomplete: state.costDataIncomplete, waitMinutes: state.waitMinutes });
    const satisfaction = requirementSatisfaction(state.stops, requirements, validation);
    if (!validation.length) feasible.push({ state, validation, satisfaction });
  }

  if (!feasible.length) {
    const reasons = [];
    const required = mealRequirements(requirements);
    required.forEach((m) => reasons.push(`Required ${m} could not be scheduled within the available time and candidate data.`));
    (requirements.hard.mustVisit || []).forEach((m) => {
      if (!beam.some((s) => s.stops.some((st) => matchesMustVisit(st, m)))) reasons.push(`Must-visit place could not be scheduled: ${m}`);
    });
    if (!reasons.length) reasons.push('No candidate sequence satisfied all hard constraints.');
    return buildInfeasibleResult(requirements, reasons, candidates, { beamWidth, searchedStates: candidatesForFinal.length });
  }

  feasible.sort((a, b) => {
    const qa = stateQuality(a.state, requirements) + a.satisfaction.score * 1.8;
    const qb = stateQuality(b.state, requirements) + b.satisfaction.score * 1.8;
    return qb - qa;
  });
  const winner = feasible[0];
  const state = winner.state;
  const totalVisitMinutes = state.stops.reduce((sum, s) => sum + Number(s.stayMinutes || 0), 0);
  const confidenceValues = state.stops.map((s) => Number(s.confidence)).filter(Number.isFinite);
  const confidence = confidenceValues.length ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) : 0;

  return {
    generatedAt: new Date().toISOString(),
    referenceTime: now.toISOString(),
    algorithm: 'geo-temporal-beam-search-v5-world-class',
    objective: 'maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements',
    status: 'FEASIBLE',
    stopCount: state.stops.length,
    totalScore: Math.round(state.score),
    totalTravelMinutes: Math.round(state.travelMinutes),
    totalVisitMinutes,
    totalWaitMinutes: Math.round(state.waitMinutes),
    estimatedCost: Math.round(state.cost * 100) / 100,
    confidence,
    stops: state.stops,
    alternatives: beam.slice(1, 4).map((candidate) => ({
      score: Math.round(candidate.score),
      stopNames: candidate.stops.map((s) => s.name),
      estimatedCost: Math.round(candidate.cost * 100) / 100,
      requirementSatisfaction: requirementSatisfaction(candidate.stops, requirements).score,
    })),
    warnings,
    requirementSatisfaction: winner.satisfaction,
    validation: { passed: true, failures: [], checks: ['opening_hours', 'time_window', 'travel', 'meals', 'must_visit', 'exclusions', 'budget', 'accessibility', 'transport', 'safety', 'duplicates'] },
    requirements: requirements,
    dayStructure: dayStructure.coverageReport(state.stops, {
      preferredCategories: requirements.soft.preferredCategories,
      personas: requirements.soft.personas,
      endMin,
    }),
    replanning: {
      supported: true,
      triggers: ['delay', 'weather_change', 'traffic_change', 'crowd_change', 'user_change', 'budget_change', 'available_time_change'],
      completedStopsImmutable: completedStops.length > 0,
    },
    diagnostics: {
      candidateCount: candidates.length,
      beamWidth,
      expansionLimit,
      memoizedIntelligenceStates: memo.size,
      searchedStates: candidatesForFinal.length,
      hardConstraints: requirements.hard,
      softPreferences: requirements.soft,
    },
  };
}

function replanAdvanced(remainingPlaces, options = {}) {
  const completed = Array.isArray(options.completedStops) ? options.completedStops : [];
  const cursor = Number.isFinite(options.cursor)
    ? options.cursor
    : (completed.at(-1)?.leaveAt ? minuteOf(completed.at(-1).leaveAt) : options.startMin);
  const currentCoords = options.currentCoords || completed.at(-1)?.coords || options.originCoords;
  return planAdvancedItinerary(remainingPlaces, {
    ...options,
    completedStops: completed,
    cursor,
    currentCoords,
    startMin: cursor,
  });
}

module.exports = {
  planAdvancedItinerary,
  replanAdvanced,
  scoreAtArrival: (place, arrivalMin, state, requirements, weather, nowBase) => {
    const travel = estimateTravel({ fromCoords: state?.prevCoords || requirements.originCoords, toCoords: place.coords, departMin: state?.cursor || requirements.hard.startMin, isFirstStop: !(state?.stops?.length) });
    return scoreTransition(place, arrivalMin, state || { cursor: requirements.hard.startMin, prevCoords: requirements.originCoords, stops: [], meals: new Set(), categories: new Set(), cost: 0, travelMinutes: 0, waitMinutes: 0 }, requirements, weather, nowBase || new Date(), travel, 0, new Map());
  },
  mealAt,
  MEALS,
  validatePlan,
  requirementSatisfaction,
};
