'use strict';

/**
 * Requirement normalization and satisfaction scoring for the authoritative itinerary optimizer.
 * Hard constraints are enforced by the search state and pre-validators; soft preferences
 * guide multi-objective beam search scoring.
 */

const { isBlacklisted } = require('./tourismPoi/tourismBlacklist');

const CATEGORY_ALIASES = {
  beach: ['beach', 'beaches', 'coast', 'bay', 'cove'],
  temple: ['temple', 'temples', 'spiritual', 'mandir', 'church', 'churches', 'mosque', 'mosques', 'gurudwara', 'ashram', 'shrine', 'basilica', 'cathedral'],
  food: ['food', 'restaurant', 'restaurants', 'cafe', 'cafes', 'local food', 'cuisine', 'dining', 'dhaba', 'biryani', 'food street', 'food court'],
  scenic: ['scenic', 'viewpoint', 'viewpoints', 'photography', 'sunset', 'sunrise', 'view', 'landscape', 'hill', 'waterfall', 'lake', 'ghat'],
  museum: ['museum', 'museums', 'history', 'heritage', 'monument', 'fort', 'palace', 'memorial', 'submarine', 'aircraft'],
  park: ['park', 'parks', 'garden', 'gardens', 'nature', 'botanical', 'zoological', 'wildlife', 'sanctuary', 'zoo', 'aquarium'],
  shopping: ['shopping', 'mall', 'malls', 'shopping mall', 'shopping destination', 'bazaar', 'market', 'handicraft', 'handicrafts', 'emporium', 'lepakshi'],
  nightlife: ['nightlife', 'night', 'bar', 'club', 'pub', 'evening entertainment'],
  cafe: ['coffee', 'cafe', 'cafes', 'bakery', 'tea'],
};

function normalizeCat(c) {
  const s = String(c || '').toLowerCase().trim();
  for (const [canon, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (s === canon || aliases.includes(s)) return canon;
  }
  return s || null;
}

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeCat).filter(Boolean);
}

function parseClock(value, fallback = null) {
  if (Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value.trim())) return fallback;
  const [h, m] = value.trim().split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return h * 60 + m;
}

function normalizeMeal(value) {
  if (!value) return null;
  const text = typeof value === 'string' ? value : value.type || value.meal || value.name;
  const meal = String(text || '').toLowerCase().trim();
  return ['breakfast', 'lunch', 'snack', 'dinner'].includes(meal) ? meal : null;
}

function isExcludedCategory(place, exclusions = []) {
  const cat = normalizeCat(place.cat || place.category);
  const name = String(place.name || '').toLowerCase();
  for (const raw of exclusions) {
    const e = normalizeCat(raw);
    if (e && cat === e) return true;
    if (e === 'temple' && /temple|mandir|iskcon|mosque|church|gurudwara|cathedral|dargah|shrine/.test(name)) return true;
    if (e === 'beach' && /\bbeach\b|\bbay\b|\bcoast\b/.test(name) && !/food|restaurant|cafe|hotel/.test(name)) return true;
    if (e === 'shopping' && /\bmall\b|\bshopping\b|\bbazaar\b|\bmarket\b/.test(name) && !/food|restaurant/.test(name)) return true;
    if (e === 'park' && /\bpark\b|\bgarden\b|\bzoo\b|\bsanctuary\b/.test(name)) return true;
  }
  return false;
}

function placeCost(place, kind = 'total') {
  const keys = kind === 'entry'
    ? ['entryFee', 'entry_fee', 'ticketPrice', 'ticket_price', 'admission', 'price']
    : ['estimatedCost', 'cost', 'price', 'entryFee', 'entry_fee'];
  for (const key of keys) {
    const n = Number(place?.[key]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function isFoodPlace(place) {
  const cat = normalizeCat(place?.cat || place?.category);
  return cat === 'food' || cat === 'cafe' || /restaurant|cafe|food|dining|kitchen|dhaba|bistro|vantillu/i.test(String(place?.name || ''));
}

function isShoppingPlace(place) {
  const cat = normalizeCat(place?.cat || place?.category);
  return cat === 'shopping' || /mall|shopping|central|inorbit|handicraft|lepakshi|bazaar|emporium/i.test(String(place?.name || ''));
}

function dietaryCompatible(place, requirements) {
  const diet = requirements?.hard?.dietaryRestrictions || [];
  if (!diet.length || !isFoodPlace(place)) return true;
  const flags = place.dietary && typeof place.dietary === 'object' ? place.dietary : {};
  for (const restriction of diet) {
    if (Object.prototype.hasOwnProperty.call(flags, restriction)) {
      if (flags[restriction] === false) return false;
      continue;
    }
    if (restriction === 'vegetarian' && (place.vegetarian === false || place.veg === false)) return false;
    if (restriction === 'vegan' && place.vegan === false) return false;
    if (restriction === 'halal' && place.halal === false) return false;
    if (restriction === 'jain' && place.jain === false) return false;
    const known = restriction === 'vegetarian' ? place.vegetarian === true || place.veg === true : place[restriction] === true;
    if (!known) return false;
  }
  return true;
}

function accessibilityCompatible(place, requirements) {
  const req = requirements?.hard?.accessibility || [];
  if (!req.length) return true;
  const flags = place.accessibility || place.accessible || {};
  for (const need of req) {
    if (flags && typeof flags === 'object' && Object.prototype.hasOwnProperty.call(flags, need)) {
      if (flags[need] !== true) return false;
      continue;
    }
    const aliases = need === 'wheelchair' ? ['wheelchair_accessible', 'wheelchair'] : need === 'stroller' ? ['stroller_accessible', 'stroller'] : need === 'mobility' ? ['mobility_accessible', 'mobility'] : [need];
    const knownPositive = aliases.some((key) => place[key] === true);
    if (!knownPositive) return false;
  }
  return true;
}

function safetyCompatible(place, requirements) {
  const forbidden = requirements?.hard?.safety?.forbiddenFlags || [];
  if (place.safe === false) return false;
  const flags = place.safetyFlags || [];
  return !forbidden.some((f) => flags.includes(f));
}

function transportCompatible(place, requirements) {
  const modes = requirements?.hard?.transportModes || [];
  if (!modes.length) return true;
  const available = Array.isArray(place.transportModes) ? place.transportModes.map((m) => String(m).toLowerCase()) : null;
  if (!available) return false;
  return modes.some((m) => available.includes(String(m).toLowerCase()));
}

function parseRequirements(raw = {}) {
  const personas = (Array.isArray(raw.personas) ? raw.personas : []).map((p) => String(p).toLowerCase().trim());
  const preferred = normalizeList(raw.preferredCategories || raw.categories || raw.prefs || []);
  const excluded = normalizeList(raw.excludedCategories || raw.exclude || []);

  if (raw.noTemples || personas.includes('no_temples') || raw.excludeTemples) excluded.push('temple');
  if (raw.noBeaches || personas.includes('no_beaches') || raw.excludeBeaches) excluded.push('beach');
  if (raw.noShopping) excluded.push('shopping');
  if (raw.noParks) excluded.push('park');

  const startMin = parseClock(raw.startMin, parseClock(raw.startTime, 9 * 60));
  const endCandidate = parseClock(raw.endMin, parseClock(raw.endTime, null));
  const durationMin = Number.isFinite(raw.totalDurationMin)
    ? Math.max(30, Number(raw.totalDurationMin))
    : (Number.isFinite(raw.durationHours) ? Math.max(30, Math.round(Number(raw.durationHours) * 60)) : null);
  const endMin = endCandidate != null ? endCandidate : startMin + (durationMin || 10 * 60);
  const maxTravelMin = Number.isFinite(raw.maxTravelMinutes) ? Math.max(1, raw.maxTravelMinutes) : null;
  const maxStops = Number.isFinite(raw.maxStops) ? Math.min(20, Math.max(1, raw.maxStops)) : null;
  const budget = Number.isFinite(raw.budget) ? Math.max(0, raw.budget) : (Number.isFinite(raw.tripBudget) ? Math.max(0, raw.tripBudget) : null);

  const requiredMeals = Array.from(new Set(
    (raw.requiredMeals || raw.mealRequirements || [])
      .map(normalizeMeal)
      .filter(Boolean),
  ));
  const mustVisit = Array.from(new Set((raw.mustVisit || raw.mustVisitPlaces || raw.mustSee || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean)));
  const mustAvoidPlaces = Array.from(new Set((raw.mustAvoidPlaces || raw.mustAvoid || raw.excludedPlaces || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean)));
  const dietaryRestrictions = Array.from(new Set([
    ...(Array.isArray(raw.dietaryRestrictions) ? raw.dietaryRestrictions : []),
    ...(raw.vegetarian ? ['vegetarian'] : []),
  ].map((x) => String(x).toLowerCase().trim()).filter(Boolean)));
  const accessibility = Array.from(new Set((raw.accessibilityRequirements || raw.accessibility || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean)));

  const onlyTouristPlaces = raw.onlyTouristPlaces === true || raw.noLocalities === true || personas.includes('only_tourist_places');
  const onlyMalls = raw.onlyMalls === true || raw.mallsOnly === true || personas.includes('only_malls');

  const hard = {
    startMin,
    endMin,
    durationMin: Math.max(30, endMin - startMin),
    excludedCategories: [...new Set(excluded)],
    maxTravelMinutes: maxTravelMin,
    maxWaitingMinutes: Number.isFinite(raw.maxWaitingMinutes) ? Math.max(0, raw.maxWaitingMinutes) : null,
    maxStops,
    requiredMeals,
    mustVisit,
    mustAvoidPlaces,
    dietaryRestrictions,
    accessibility,
    onlyTouristPlaces,
    onlyMalls,
    transportModes: Array.isArray(raw.transportModes || raw.allowedTransport) ? (raw.transportModes || raw.allowedTransport) : [],
    safety: {
      enabled: raw.safetyHard === true || raw.safetyRequired === true,
      forbiddenFlags: Array.isArray(raw.forbiddenSafetyFlags) ? raw.forbiddenSafetyFlags : [],
    },
    budget: budget,
    budgetHard: raw.budgetHard === true || raw.budgetIsHard === true ? budget : null,
    mustLeaveBy: endMin,
  };

  const soft = {
    preferredCategories: [...new Set(preferred)],
    personas,
    tripMode: raw.tripMode || null,
    lowCrowd: personas.includes('low_crowd') || raw.lowCrowd === true,
    photography: personas.some((p) => /photo|scenic/.test(p)) || preferred.includes('scenic') || raw.photography === true,
    foodFocus: preferred.includes('food') || personas.some((p) => /food/.test(p)) || raw.foodFocus === true,
    shoppingFocus: preferred.includes('shopping') || personas.some((p) => /shopping|mall/.test(p)) || raw.shoppingFocus === true,
    family: personas.includes('family') || raw.tripMode === 'family',
    relaxed: String(raw.tripMode || '').toLowerCase() === 'relaxed' || raw.relaxed === true,
    budget,
    safety: raw.safetyRequired === true,
  };

  return {
    hard,
    soft,
    originCoords: Array.isArray(raw.originCoords || raw.fromCoords) ? (raw.originCoords || raw.fromCoords) : null,
    weather: raw.weather || null,
    region: raw.region || null,
    now: raw.now || null,
  };
}

function candidateMatchesHardRequirements(place, requirements) {
  // 1. Excluded categories (e.g. no temples, no beaches)
  if (isExcludedCategory(place, requirements.hard.excludedCategories)) {
    return { ok: false, reason: 'excluded_category' };
  }

  // 2. Strict locality check if only tourist places is requested
  if (requirements.hard.onlyTouristPlaces || true) {
    const blacklist = isBlacklisted(place.name, place);
    if (blacklist.isBlacklisted) {
      return { ok: false, reason: 'non_tourist_locality' };
    }
  }

  // 3. Only malls requested
  if (requirements.hard.onlyMalls && !isShoppingPlace(place)) {
    return { ok: false, reason: 'not_a_mall' };
  }

  // 4. Must avoid places
  if ((requirements.hard.mustAvoidPlaces || []).some((ref) => {
    const target = String(ref).toLowerCase().trim();
    const id = String(place.id ?? place.placeId ?? place.name).toLowerCase();
    const name = String(place.name || '').toLowerCase();
    return id === target || name === target || name.includes(target) || target.includes(name);
  })) {
    return { ok: false, reason: 'must_avoid_place' };
  }

  // 5. Dietary, accessibility, transport, safety
  if (!dietaryCompatible(place, requirements)) return { ok: false, reason: 'dietary_restriction' };
  if (!accessibilityCompatible(place, requirements)) return { ok: false, reason: 'accessibility' };
  if (!transportCompatible(place, requirements)) return { ok: false, reason: 'transport' };
  if (!safetyCompatible(place, requirements)) return { ok: false, reason: 'unsafe' };

  // 6. Only malls filter
  if (requirements.hard.onlyMalls) {
    const isMall = isShoppingPlace(place) && /mall|central|plaza|centre|inorbit/i.test(place.name) && !/handicraft|emporium|bazaar|market/i.test(place.name);
    if (!isMall) return { ok: false, reason: 'only_malls_required' };
  }

  // 7. Lodging filter
  const name = String(place.name || '').toLowerCase();
  const cat = normalizeCat(place.cat || place.category);
  if (cat === 'hotel' || cat === 'lodging') return { ok: false, reason: 'lodging' };
  if (/\bhotel\b|\bresort\b|\blodge\b/.test(name) && !/restaurant|cafe|food|kitchen|dhaba/.test(name)) {
    return { ok: false, reason: 'lodging' };
  }

  return { ok: true };
}

function filterCandidates(places, requirements) {
  return (places || []).filter((p) => candidateMatchesHardRequirements(p, requirements).ok);
}

/**
 * Computes explicit requirement satisfaction metrics (0-100) for a completed itinerary.
 * @param {object} itinerary - Optimized itinerary object with stops
 * @param {object} requirements - Parsed requirements
 * @returns {object} Satisfaction score and breakdown
 */
function computeRequirementSatisfaction(itinerary = {}, requirements = {}) {
  const stops = Array.isArray(itinerary.stops) ? itinerary.stops : [];
  const hard = requirements.hard || {};
  const soft = requirements.soft || {};

  let earnedPoints = 0;
  let maxPoints = 0;
  const satisfiedCriteria = [];
  const unsatisfiedCriteria = [];

  // 1. Hard Exclusions (30 pts weight)
  maxPoints += 30;
  let exclusionViolations = 0;
  for (const stop of stops) {
    if (isExcludedCategory(stop, hard.excludedCategories || [])) exclusionViolations++;
  }
  if (exclusionViolations === 0) {
    earnedPoints += 30;
    satisfiedCriteria.push('All hard exclusions respected');
  } else {
    unsatisfiedCriteria.push(`Violated hard exclusions (${exclusionViolations} prohibited stops)`);
  }

  // 2. Preferred Categories Coverage (35 pts weight)
  const preferredCats = soft.preferredCategories || [];
  if (preferredCats.length > 0) {
    maxPoints += 35;
    const coveredCats = new Set(stops.map((s) => normalizeCat(s.cat || s.category)));
    let coveredCount = 0;
    for (const cat of preferredCats) {
      if (coveredCats.has(cat)) {
        coveredCount++;
        satisfiedCriteria.push(`Included preferred category: ${cat}`);
      } else {
        unsatisfiedCriteria.push(`Missing preferred category: ${cat}`);
      }
    }
    const catPoints = (coveredCount / preferredCats.length) * 35;
    earnedPoints += catPoints;
  }

  // 3. Time Duration & Schedule Compliance (20 pts weight)
  maxPoints += 20;
  const totalTravelAndDwell = (itinerary.totalTravelMinutes || 0) + (itinerary.totalDwellMinutes || stops.reduce((acc, s) => acc + (s.durationMinutes || s.visitMinutes || 45), 0));
  if (totalTravelAndDwell <= hard.durationMin + 30) {
    earnedPoints += 20;
    satisfiedCriteria.push(`Itinerary duration within budget (${Math.round(totalTravelAndDwell / 60)}h)`);
  } else {
    earnedPoints += 10;
    unsatisfiedCriteria.push('Itinerary slightly exceeded requested duration limit');
  }

  // 4. Soft Focus Goals (Photography / Food / Shopping / Low Crowd) (15 pts weight)
  maxPoints += 15;
  let softPoints = 0;
  let softChecks = 0;

  if (soft.photography) {
    softChecks++;
    const hasPhotoSpot = stops.some((s) => s.is_sunset_spot || s.is_sunrise_spot || normalizeCat(s.cat) === 'scenic' || normalizeCat(s.cat) === 'beach');
    if (hasPhotoSpot) { softPoints++; satisfiedCriteria.push('Photography/Scenic window satisfied'); }
    else unsatisfiedCriteria.push('No primary photography/scenic stop');
  }
  if (soft.foodFocus) {
    softChecks++;
    const hasFood = stops.some(isFoodPlace);
    if (hasFood) { softPoints++; satisfiedCriteria.push('Food preference satisfied'); }
    else unsatisfiedCriteria.push('No verified food stop included');
  }
  if (soft.shoppingFocus) {
    softChecks++;
    const hasShopping = stops.some(isShoppingPlace);
    if (hasShopping) { softPoints++; satisfiedCriteria.push('Shopping destination satisfied'); }
    else unsatisfiedCriteria.push('No verified shopping destination included');
  }
  if (soft.lowCrowd) {
    softChecks++;
    const lowCrowdStops = stops.filter((s) => ['Low', 'Very Low', 'Moderate'].includes(s.crowdLevel || s.crowd?.level));
    if (lowCrowdStops.length >= Math.ceil(stops.length * 0.6)) { softPoints++; satisfiedCriteria.push('Low crowd preference satisfied'); }
    else unsatisfiedCriteria.push('Crowd levels moderate/high');
  }

  if (softChecks > 0) {
    earnedPoints += (softPoints / softChecks) * 15;
  } else {
    earnedPoints += 15;
  }

  const satisfactionScore = maxPoints > 0 ? Math.max(0, Math.min(100, Math.round((earnedPoints / maxPoints) * 100))) : 100;

  return {
    satisfactionScore,
    isFullySatisfied: satisfactionScore >= 80 && exclusionViolations === 0,
    satisfiedCriteria,
    unsatisfiedCriteria,
    metrics: {
      earnedPoints: Math.round(earnedPoints),
      maxPoints,
      exclusionViolations,
      stopsCount: stops.length,
    },
  };
}

module.exports = {
  parseRequirements,
  filterCandidates,
  candidateMatchesHardRequirements,
  computeRequirementSatisfaction,
  isExcludedCategory,
  normalizeCat,
  normalizeMeal,
  placeCost,
  isFoodPlace,
  isShoppingPlace,
  CATEGORY_ALIASES,
};
