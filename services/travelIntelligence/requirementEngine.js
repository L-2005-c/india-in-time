'use strict';

/**
 * Requirement normalization for the authoritative itinerary optimizer.
 * Hard constraints are enforced by the search state; soft preferences only
 * affect objective scoring.
 */

const CATEGORY_ALIASES = {
  beach: ['beach', 'beaches', 'coast', 'bay'],
  temple: ['temple', 'temples', 'spiritual', 'mandir', 'church', 'churches', 'mosque', 'mosques', 'gurudwara'],
  food: ['food', 'restaurant', 'restaurants', 'cafe', 'cafes', 'local food', 'cuisine', 'dining'],
  scenic: ['scenic', 'viewpoint', 'viewpoints', 'photography', 'sunset', 'sunrise', 'view'],
  trekking: ['trekking', 'trek', 'treks', 'hike', 'hiking', 'trails', 'trail', 'mountain', 'hill climbing'],
  museum: ['museum', 'museums', 'history', 'heritage', 'monument', 'fort'],
  park: ['park', 'parks', 'garden', 'nature'],
  market: ['market', 'bazaar', 'haat'],
  shopping: ['shopping', 'mall', 'malls', 'shopping mall', 'shopping centre', 'shopping center'],
  nightlife: ['nightlife', 'night', 'bar', 'club'],
  cafe: ['coffee', 'cafe', 'cafes'],
  entertainment: ['entertainment', 'cinema', 'theme park'],
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
    if (e === 'temple' && /temple|mandir|iskcon|mosque|church|gurudwara|cathedral/.test(name)) return true;
    if (e === 'beach' && /\bbeach\b|\bbay\b/.test(name) && !/food|restaurant|cafe|hotel/.test(name)) return true;
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
  return cat === 'food' || cat === 'cafe' || /restaurant|cafe|food|dining|kitchen|dhaba/i.test(String(place?.name || ''));
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
    // Hard dietary constraints require positive evidence.
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
  if (raw.noTemples || personas.includes('no_temples')) excluded.push('temple');
  if (raw.noBeaches) excluded.push('beach');

  const startMin = parseClock(raw.startMin, parseClock(raw.startTime, 9 * 60));
  const endCandidate = parseClock(raw.endMin, parseClock(raw.endTime, null));
  const durationMin = Number.isFinite(raw.totalDurationMin) ? Math.max(30, Number(raw.totalDurationMin)) : null;
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
  const exclusiveCategories = normalizeList(raw.exclusiveCategories || raw.onlyCategories || []);
  // "I want malls only" style natural language hints
  if (raw.mallsOnly === true || raw.onlyMalls === true) exclusiveCategories.push('shopping');
  if (raw.beachesOnly === true || raw.onlyBeaches === true) exclusiveCategories.push('beach');
  if (raw.templesOnly === true || raw.onlyTemples === true) exclusiveCategories.push('temple');
  const dietaryRestrictions = Array.from(new Set([
    ...(Array.isArray(raw.dietaryRestrictions) ? raw.dietaryRestrictions : []),
    ...(raw.vegetarian ? ['vegetarian'] : []),
  ].map((x) => String(x).toLowerCase().trim()).filter(Boolean)));
  const accessibility = Array.from(new Set((raw.accessibilityRequirements || raw.accessibility || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean)));

  const hard = {
    startMin,
    endMin,
    durationMin: Math.max(30, endMin - startMin),
    excludedCategories: [...new Set(excluded)],
    exclusiveCategories: [...new Set(exclusiveCategories)],
    maxTravelMinutes: maxTravelMin,
    maxWaitingMinutes: Number.isFinite(raw.maxWaitingMinutes) ? Math.max(0, raw.maxWaitingMinutes) : null,
    maxStops,
    requiredMeals,
    mustVisit,
    mustAvoidPlaces,
    dietaryRestrictions,
    accessibility,
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
    photography: personas.some((p) => /photo|scenic/.test(p)) || preferred.includes('scenic'),
    foodFocus: preferred.includes('food') || personas.some((p) => /food/.test(p)),
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

function hasUsableCoords(place) {
  return Array.isArray(place?.coords) && place.coords.length >= 2
    && Number.isFinite(Number(place.coords[0])) && Number.isFinite(Number(place.coords[1]));
}

function candidateMatchesHardRequirements(place, requirements) {
  // The optimizer computes every travel leg from place.coords — a place
  // without usable coordinates can't be distanced, routed, or timed, so it
  // must never reach the beam search as a schedulable candidate. (It's
  // still surfaced upstream in multiDayPlanner's unusedPlaces with a
  // "no coordinates" reason instead of silently vanishing.)
  if (!hasUsableCoords(place)) return { ok: false, reason: 'no_coordinates' };
  if (isExcludedCategory(place, requirements.hard.excludedCategories)) return { ok: false, reason: 'excluded_category' };
  if ((requirements.hard.mustAvoidPlaces || []).some((ref) => {
    const target = String(ref).toLowerCase().trim();
    const id = String(place.id ?? place.placeId ?? place.name).toLowerCase();
    const name = String(place.name || '').toLowerCase();
    return id === target || name === target || name.includes(target) || target.includes(name);
  })) return { ok: false, reason: 'must_avoid_place' };
  if (!dietaryCompatible(place, requirements)) return { ok: false, reason: 'dietary_restriction' };
  if (!accessibilityCompatible(place, requirements)) return { ok: false, reason: 'accessibility' };
  if (!transportCompatible(place, requirements)) return { ok: false, reason: 'transport' };
  if (!safetyCompatible(place, requirements)) return { ok: false, reason: 'unsafe' };
  const name = String(place.name || '').toLowerCase();
  const cat = normalizeCat(place.cat || place.category);
  if (cat === 'hotel' || cat === 'lodging') return { ok: false, reason: 'lodging' };
  if (/\bhotel\b|\bresort\b|\blodge\b/.test(name) && !/restaurant|cafe|food|kitchen|dhaba/.test(name)) return { ok: false, reason: 'lodging' };
  return { ok: true };
}

function filterCandidates(places, requirements) {
  return (places || []).filter((p) => candidateMatchesHardRequirements(p, requirements).ok);
}

/**
 * Detects hard requirement conflicts before optimization begins.
 * Returns structured conflict data with 3 actionable resolution alternatives.
 */
function detectConflictingRequirements(requirements, places = [], startCoords = null) {
  const req = requirements?.hard || requirements || {};
  const conflicts = [];
  const startMin = req.startTimeMinutes != null ? req.startTimeMinutes : 540; // 09:00
  const endMin = req.endTimeMinutes != null ? req.endTimeMinutes : 1140; // 19:00
  const availableMinutes = req.maxTripMinutes || Math.max(0, endMin - startMin);

  const mustIncludes = (req.mustIncludePlaces || []).map(r => String(r).toLowerCase().trim());
  const mandatoryPlaces = places.filter(p => {
    const name = String(p.name || '').toLowerCase();
    const id = String(p.id || '').toLowerCase();
    return mustIncludes.some(m => name.includes(m) || m.includes(name) || id === m);
  });

  // Check 1: Mandatory place visit time overflow
  let minMandatoryMinutes = 0;
  mandatoryPlaces.forEach(p => {
    minMandatoryMinutes += Math.max(30, Number(p.vt || p.visitMinutes || 45));
  });

  // Conservative travel time estimate (15 min average per stop)
  const estimatedTravelMinutes = mandatoryPlaces.length > 1 ? (mandatoryPlaces.length - 1) * 18 : 0;
  const totalMinRequired = minMandatoryMinutes + estimatedTravelMinutes;

  if (totalMinRequired > availableMinutes && availableMinutes > 0) {
    conflicts.push(`Requested ${mandatoryPlaces.length} mandatory stops require at least ${totalMinRequired} mins, but only ${availableMinutes} mins are scheduled.`);
  }

  // Check 2: Unmatched mandatory place
  if (mustIncludes.length > mandatoryPlaces.length) {
    const missing = mustIncludes.filter(m => !mandatoryPlaces.some(p => String(p.name).toLowerCase().includes(m)));
    if (missing.length > 0) {
      conflicts.push(`Could not locate verified destination matching: ${missing.join(', ')}.`);
    }
  }

  // Check 3: Short trip asking for sunset + dinner + distant sights
  const wantsSunset = (requirements?.soft?.preferredCategories || []).includes('scenic') || (req.mustIncludePlaces || []).some(m => /beach|sunset|viewpoint/i.test(m));
  const wantsDinner = req.mealPreference === 'dinner' || (req.requiredMeals || []).includes('dinner');
  if (wantsSunset && wantsDinner && availableMinutes < 150) {
    conflicts.push('A sunset view followed by dinner comfortably requires at least 2.5–3 hours to avoid rushing.');
  }

  if (!conflicts.length) {
    return { isConflicting: false, conflicts: [], alternatives: [] };
  }

  const suggestedDurationHours = Math.ceil((totalMinRequired + 60) / 60);

  const alternatives = [
    {
      id: 'A',
      title: 'Prioritize Top Scenic Highlights',
      description: 'Focus on the single highest-rated highlight and pair with a nearby dining spot.',
      adjustedParams: { maxTripMinutes: availableMinutes, prioritizeScenic: true },
    },
    {
      id: 'B',
      title: 'Streamlined Fast-Paced Tour',
      description: 'Reduce time spent at each stop (25–30 mins) to fit all mandatory destinations.',
      adjustedParams: { stopPacing: 'fast', maxTripMinutes: availableMinutes },
    },
    {
      id: 'C',
      title: `Extend Trip to ${suggestedDurationHours} Hours`,
      description: `Expand trip window by ${suggestedDurationHours * 60 - availableMinutes} mins for a relaxed, complete experience.`,
      adjustedParams: { maxTripMinutes: suggestedDurationHours * 60, endTimeMinutes: startMin + suggestedDurationHours * 60 },
    },
  ];

  return {
    isConflicting: true,
    conflicts,
    alternatives,
    summary: `Your requested constraints conflict: ${conflicts[0]}`,
  };
}

module.exports = {
  parseRequirements,
  filterCandidates,
  candidateMatchesHardRequirements,
  detectConflictingRequirements,
  hasUsableCoords,
  isExcludedCategory,
  normalizeCat,
  normalizeMeal,
  placeCost,
  isFoodPlace,
  CATEGORY_ALIASES,
};
