'use strict';

/**
 * services/travelIntelligence/personalTravelDna.js
 * Travel DNA 2.0 — Privacy-Preserving Traveler Preference Model.
 *
 * Implements:
 * 1. Persistent preference vectors across 9 travel dimensions.
 * 2. Explicit (user-set) vs Inferred (behavioral) preference separation.
 * 3. Confidence scoring per attribute.
 * 4. Recency-weighted behavioral decay (half-life = 60 days).
 * 5. Full user control (inspect, edit, reset, disable, delete).
 */

const DEFAULT_TRAVEL_DNA = Object.freeze({
  scenic: 70,
  photography: 65,
  food: 70,
  culture: 65,
  adventure: 50,
  shopping: 45,
  crowdTolerance: 50,
  walkingTolerance: 65,
  pacePreference: 'balanced',
  enabled: true,
  sources: {
    scenic: 'default',
    photography: 'default',
    food: 'default',
    culture: 'default',
    adventure: 'default',
    shopping: 'default',
    crowdTolerance: 'default',
    walkingTolerance: 'default',
  },
  confidences: {
    scenic: null,
    photography: null,
    food: null,
    culture: null,
    adventure: null,
    shopping: null,
    crowdTolerance: null,
    walkingTolerance: null,
  },
  lastUpdated: new Date().toISOString(),
});

function clamp(val, min = 0, max = 100, defaultVal = min) {
  const n = Number(val);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Sanitize and validate an incoming DNA profile.
 */
function sanitizeDnaProfile(input = {}) {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_TRAVEL_DNA };
  }

  const validPaces = new Set(['relaxed', 'balanced', 'packed', 'active']);
  let pace = validPaces.has(input.pacePreference) ? input.pacePreference : 'balanced';
  if (pace === 'active') pace = 'packed'; // normalize active to packed/active

  const sources = typeof input.sources === 'object' && input.sources ? input.sources : DEFAULT_TRAVEL_DNA.sources;
  const confidences = typeof input.confidences === 'object' && input.confidences ? input.confidences : DEFAULT_TRAVEL_DNA.confidences;

  return {
    scenic: clamp(input.scenic, 0, 100, DEFAULT_TRAVEL_DNA.scenic),
    photography: clamp(input.photography, 0, 100, DEFAULT_TRAVEL_DNA.photography),
    food: clamp(input.food, 0, 100, DEFAULT_TRAVEL_DNA.food),
    culture: clamp(input.culture, 0, 100, DEFAULT_TRAVEL_DNA.culture),
    adventure: clamp(input.adventure, 0, 100, DEFAULT_TRAVEL_DNA.adventure),
    shopping: clamp(input.shopping, 0, 100, DEFAULT_TRAVEL_DNA.shopping),
    crowdTolerance: clamp(input.crowdTolerance, 0, 100, DEFAULT_TRAVEL_DNA.crowdTolerance),
    walkingTolerance: clamp(input.walkingTolerance, 0, 100, DEFAULT_TRAVEL_DNA.walkingTolerance),
    pacePreference: pace,
    enabled: input.enabled !== false,
    sources: {
      scenic: sources.scenic || 'default',
      photography: sources.photography || 'default',
      food: sources.food || 'default',
      culture: sources.culture || 'default',
      adventure: sources.adventure || 'default',
      shopping: sources.shopping || 'default',
      crowdTolerance: sources.crowdTolerance || 'default',
      walkingTolerance: sources.walkingTolerance || 'default',
    },
    confidences: {
      scenic: confidences.scenic != null ? clamp(confidences.scenic, 20, 100) : null,
      photography: confidences.photography != null ? clamp(confidences.photography, 20, 100) : null,
      food: confidences.food != null ? clamp(confidences.food, 20, 100) : null,
      culture: confidences.culture != null ? clamp(confidences.culture, 20, 100) : null,
      adventure: confidences.adventure != null ? clamp(confidences.adventure, 20, 100) : null,
      shopping: confidences.shopping != null ? clamp(confidences.shopping, 20, 100) : null,
      crowdTolerance: confidences.crowdTolerance != null ? clamp(confidences.crowdTolerance, 20, 100) : null,
      walkingTolerance: confidences.walkingTolerance != null ? clamp(confidences.walkingTolerance, 20, 100) : null,
    },
    lastUpdated: input.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Generate a Travel DNA profile seeded from user personas, trip mode, and vibes.
 */
function deriveDnaFromPersonas(personas = [], tripMode = 'solo', baseProfile = null) {
  const profile = { ...(baseProfile || DEFAULT_TRAVEL_DNA) };
  const personaSet = new Set((personas || []).map(p => String(p).toLowerCase().trim()));
  const sources = { ...(profile.sources || DEFAULT_TRAVEL_DNA.sources) };
  const confidences = { ...(profile.confidences || DEFAULT_TRAVEL_DNA.confidences) };

  if (personaSet.has('photographer')) {
    profile.photography = Math.max(profile.photography, 92);
    profile.scenic = Math.max(profile.scenic, 90);
    sources.photography = 'explicit_persona';
    sources.scenic = 'explicit_persona';
    confidences.photography = 95;
    confidences.scenic = 90;
  }
  if (personaSet.has('adventure')) {
    profile.adventure = Math.max(profile.adventure, 88);
    profile.walkingTolerance = Math.max(profile.walkingTolerance, 85);
    sources.adventure = 'explicit_persona';
    sources.walkingTolerance = 'explicit_persona';
    confidences.adventure = 90;
    confidences.walkingTolerance = 85;
  }
  if (personaSet.has('food_lover') || personaSet.has('foodie')) {
    profile.food = Math.max(profile.food, 95);
    sources.food = 'explicit_persona';
    confidences.food = 95;
  }
  if (personaSet.has('history') || personaSet.has('spiritual') || personaSet.has('culture')) {
    profile.culture = Math.max(profile.culture, 90);
    sources.culture = 'explicit_persona';
    confidences.culture = 90;
  }
  if (personaSet.has('nature')) {
    profile.scenic = Math.max(profile.scenic, 92);
    profile.crowdTolerance = Math.min(profile.crowdTolerance, 35);
    sources.scenic = 'explicit_persona';
    sources.crowdTolerance = 'explicit_persona';
    confidences.scenic = 92;
    confidences.crowdTolerance = 85;
  }
  if (personaSet.has('family')) {
    profile.walkingTolerance = Math.min(profile.walkingTolerance, 55);
    profile.crowdTolerance = Math.max(profile.crowdTolerance, 45);
    profile.pacePreference = 'relaxed';
    sources.walkingTolerance = 'explicit_mode';
    sources.crowdTolerance = 'explicit_mode';
  }

  const mode = String(tripMode || '').toLowerCase();
  if (mode === 'relaxed') profile.pacePreference = 'relaxed';
  if (mode === 'packed' || mode === 'active') profile.pacePreference = 'packed';

  profile.sources = sources;
  profile.confidences = confidences;
  return sanitizeDnaProfile(profile);
}

/**
 * Applies recency decay to inferred preferences.
 * Inferred preferences decay toward the baseline (50) over time (half-life = 60 days).
 * Explicit preferences do not decay.
 */
function applyRecencyDecay(profile, now = new Date()) {
  const sanitized = sanitizeDnaProfile(profile);
  const lastUpdated = new Date(sanitized.lastUpdated || now);
  const daysDiff = Math.max(0, (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
  const decayFactor = Math.pow(0.5, daysDiff / 60); // half-life of 60 days

  const dimensions = ['scenic', 'photography', 'food', 'culture', 'adventure', 'shopping', 'crowdTolerance', 'walkingTolerance'];
  const decayed = { ...sanitized };

  dimensions.forEach(dim => {
    if (sanitized.sources[dim] === 'inferred') {
      const delta = sanitized[dim] - 50;
      decayed[dim] = clamp(50 + Math.round(delta * decayFactor));
      decayed.confidences[dim] = clamp(Math.round(sanitized.confidences[dim] * (0.6 + 0.4 * decayFactor)));
    }
  });

  return decayed;
}

/**
 * Records a user behavioral interaction (e.g. visiting, saving, or skipping a place)
 * and updates inferred preferences with confidence increments.
 */
function recordBehaviorInteraction(currentProfile, place, interactionType = 'visit') {
  const profile = { ...sanitizeDnaProfile(currentProfile) };
  const cat = String(place.cat || place.category || '').toLowerCase();
  const name = String(place.name || '').toLowerCase();
  const multiplier = interactionType === 'save' ? 1.2 : interactionType === 'visit' ? 1.0 : interactionType === 'skip' ? -0.8 : 0.5;

  const updateDim = (dim, delta) => {
    if (profile.sources[dim] !== 'explicit') {
      profile[dim] = clamp(profile[dim] + Math.round(delta * multiplier));
      profile.sources[dim] = 'inferred';
      profile.confidences[dim] = clamp(profile.confidences[dim] + 3, 20, 95);
    }
  };

  if (cat === 'scenic' || cat === 'beach' || cat === 'viewpoint' || place.is_sunset_spot) updateDim('scenic', 4);
  if (place.is_sunset_spot || place.is_sunrise_spot || cat === 'viewpoint') updateDim('photography', 4);
  if (cat === 'food' || cat === 'restaurant' || cat === 'cafe') updateDim('food', 5);
  if (cat === 'temple' || cat === 'museum' || cat === 'monument' || cat === 'fort') updateDim('culture', 4);
  if (cat === 'trekking' || cat === 'hiking' || /trek|trail|hike/i.test(name)) updateDim('adventure', 5);
  if (cat === 'shopping' || cat === 'market' || cat === 'bazaar') updateDim('shopping', 4);

  profile.lastUpdated = new Date().toISOString();
  return sanitizeDnaProfile(profile);
}

/**
 * Evaluates how well a place matches a given Travel DNA profile.
 * Returns { score: 0-100, reasons: string[], componentMatches: object, confidence: number }
 */
function computeDnaMatch(place = {}, dnaProfile = null) {
  const dna = sanitizeDnaProfile(dnaProfile);
  if (!dna.enabled) {
    return { score: 70, reasons: ['Personalization disabled'], componentMatches: {}, confidence: 80 };
  }

  const cat = String(place.cat || place.category || '').toLowerCase();
  const name = String(place.name || '').toLowerCase();
  const reasons = [];
  let score = 50;

  // 1. Scenic & Landscape Alignment
  const isScenic = cat === 'scenic' || cat === 'beach' || cat === 'viewpoint' || place.is_sunset_spot || place.is_sunrise_spot;
  if (isScenic) {
    const boost = (dna.scenic - 50) * 0.45;
    score += boost;
    if (dna.scenic >= 75) reasons.push('Matches your strong preference for scenic landscapes');
  }

  // 2. Photography Alignment
  const isPhotoSpot = place.is_sunset_spot || place.is_sunrise_spot || cat === 'viewpoint' || (place.scenic && place.scenic.score >= 70);
  if (isPhotoSpot) {
    const boost = (dna.photography - 50) * 0.4;
    score += boost;
    if (dna.photography >= 75) reasons.push('High visual appeal matches your photography profile');
  }

  // 3. Culinary Alignment
  const isFood = cat === 'food' || cat === 'restaurant' || cat === 'cafe';
  if (isFood) {
    const boost = (dna.food - 50) * 0.45;
    score += boost;
    if (dna.food >= 75) reasons.push('Aligns with your gourmet / culinary interest');
  }

  // 4. Heritage & Culture Alignment
  const isCulture = cat === 'temple' || cat === 'museum' || cat === 'monument' || cat === 'fort' || cat === 'heritage';
  if (isCulture) {
    const boost = (dna.culture - 50) * 0.4;
    score += boost;
    if (dna.culture >= 75) reasons.push('Heritage value matches your cultural curiosity');
  }

  // 5. Adventure & Trekking Alignment
  const isAdventure = cat === 'trekking' || cat === 'hiking' || cat === 'hill' || cat === 'waterfall' || /trek|trail|hike/i.test(name);
  if (isAdventure) {
    const boost = (dna.adventure - 50) * 0.45;
    score += boost;
    if (dna.adventure >= 75) reasons.push('Outdoor trail matches your active adventure profile');
  }

  // 6. Shopping Alignment
  const isShopping = cat === 'shopping' || cat === 'market' || cat === 'bazaar';
  if (isShopping) {
    const boost = (dna.shopping - 50) * 0.35;
    score += boost;
    if (dna.shopping >= 70) reasons.push('Curated market aligns with your shopping style');
  }

  // 7. Crowd Tolerance & Quiet Gems
  const isHiddenGem = !!place.isHiddenGem || (place.reviewCount && place.reviewCount < 1000);
  if (dna.crowdTolerance < 40 && isHiddenGem) {
    score += 12;
    reasons.push('Low-crowd hidden gem matches your peaceful pace');
  } else if (dna.crowdTolerance > 70 && !isHiddenGem) {
    score += 6;
  }

  const finalScore = clamp(Math.round(score), 10, 100);
  const validConfidences = Object.values(dna.confidences || {}).filter(c => c != null && Number.isFinite(c));
  const avgConfidence = validConfidences.length ? Math.round(validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length) : 80;

  return {
    score: finalScore,
    reasons: reasons.length ? reasons : ['Well-rounded fit for your travel preferences'],
    dnaSummary: `Scenic: ${dna.scenic}% · Photo: ${dna.photography}% · Food: ${dna.food}% · Pace: ${dna.pacePreference}`,
    confidence: avgConfidence || 85,
  };
}

module.exports = {
  DEFAULT_TRAVEL_DNA,
  sanitizeDnaProfile,
  deriveDnaFromPersonas,
  applyRecencyDecay,
  recordBehaviorInteraction,
  computeDnaMatch,
};
