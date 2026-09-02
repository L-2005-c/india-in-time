'use strict';

/**
 * services/travelIntelligence/destinationFingerprints.js
 * Destination Experience Fingerprints Engine.
 *
 * Implements:
 * 1. 8-dimensional experience vector profiling (Scenic, Photography, Culture, Family, Food, Shopping, Adventure, Relaxation).
 * 2. Cosine similarity calculation to discover "Places like this".
 * 3. Fingerprint distance metric to discover "Show me something completely different".
 * 4. Provenance, confidence, and evidence tracking.
 */

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

const PROVENANCE_LAYERS = Object.freeze({
  CURATED_PRIOR: 'CURATED_PRIOR',
  OBSERVED_DATA: 'OBSERVED_DATA',
  USER_BEHAVIOR: 'USER_BEHAVIOR',
  MODEL_OUTPUT: 'MODEL_OUTPUT',
});

/**
 * Computes the 14-dimensional evidence-aware experience profile for any place entity.
 */
function computeDestinationFingerprint(place = {}) {
  const cat = String(place.cat || place.category || 'default').toLowerCase();
  const rating = Number(place.rating || 4.2);
  const isSunset = !!place.is_sunset_spot;
  const isSunrise = !!place.is_sunrise_spot;

  const vector = {
    scenic: 30,
    photography: 30,
    culture: 30,
    heritage: 30,
    family: 50,
    food: 20,
    shopping: 15,
    adventure: 25,
    relaxation: 50,
    nightlife: 20,
    nature: 30,
    indoorSuitability: 50,
    rainSuitability: 50,
    heatSuitability: 50,
  };

  const evidence = {};

  if (cat === 'beach') {
    vector.scenic = 92;
    vector.nature = 90;
    vector.photography = 88;
    vector.relaxation = 90;
    vector.family = 85;
    vector.rainSuitability = 20;
    vector.indoorSuitability = 10;
    vector.heatSuitability = 40;
    evidence.scenic = 'Ocean coastal vista';
  } else if (cat === 'viewpoint' || cat === 'hill') {
    vector.scenic = 96;
    vector.nature = 94;
    vector.photography = 94;
    vector.adventure = 65;
    vector.relaxation = 80;
    vector.rainSuitability = 25;
    vector.indoorSuitability = 10;
    vector.heatSuitability = 55;
    evidence.scenic = 'Panoramic landscape elevation';
  } else if (cat === 'temple' || cat === 'monument' || cat === 'fort') {
    vector.culture = 95;
    vector.heritage = 95;
    vector.photography = 82;
    vector.family = 75;
    vector.scenic = cat === 'fort' ? 85 : 55;
    vector.indoorSuitability = cat === 'monument' || cat === 'fort' ? 40 : 70;
    vector.rainSuitability = cat === 'fort' ? 30 : 65;
    vector.heatSuitability = cat === 'fort' ? 30 : 60;
    evidence.culture = 'Architectural heritage & spiritual significance';
    evidence.heritage = 'Historical monument structure';
  } else if (cat === 'museum') {
    vector.culture = 90;
    vector.heritage = 88;
    vector.family = 80;
    vector.relaxation = 65;
    vector.indoorSuitability = 95;
    vector.rainSuitability = 95;
    vector.heatSuitability = 95;
    evidence.culture = 'Curated historic exhibits';
  } else if (cat === 'park' || cat === 'garden') {
    vector.relaxation = 90;
    vector.family = 92;
    vector.scenic = 75;
    vector.nature = 85;
    vector.indoorSuitability = 15;
    vector.rainSuitability = 25;
    vector.heatSuitability = 45;
    evidence.family = 'Open green recreational area';
  } else if (cat === 'food' || cat === 'restaurant' || cat === 'cafe') {
    vector.food = 95;
    vector.relaxation = 75;
    vector.indoorSuitability = 90;
    vector.rainSuitability = 90;
    vector.heatSuitability = 90;
    evidence.food = 'Gastronomic dining destination';
  } else if (cat === 'shopping' || cat === 'market' || cat === 'mall' || cat === 'bazaar') {
    vector.shopping = 95;
    vector.family = 78;
    vector.indoorSuitability = cat === 'mall' ? 95 : 60;
    vector.rainSuitability = cat === 'mall' ? 95 : 45;
    vector.heatSuitability = cat === 'mall' ? 95 : 45;
    evidence.shopping = 'Retail & marketplace hub';
  } else if (cat === 'waterfall' || cat === 'trekking') {
    vector.adventure = 92;
    vector.scenic = 90;
    vector.nature = 95;
    vector.photography = 88;
    vector.indoorSuitability = 5;
    vector.rainSuitability = cat === 'waterfall' ? 70 : 15;
    vector.heatSuitability = 35;
    evidence.adventure = 'Active nature exploration';
  }

  if (isSunset || isSunrise) {
    vector.photography = Math.max(vector.photography, 95);
    vector.scenic = Math.max(vector.scenic, 94);
  }

  // Rating modifier
  if (rating >= 4.5) {
    Object.keys(vector).forEach(k => {
      vector[k] = clamp(vector[k] * 1.05);
    });
  }

  const isIndoor = ['museum', 'food', 'restaurant', 'cafe', 'shopping', 'mall'].includes(cat) || vector.indoorSuitability >= 80;
  const isOutdoor = ['beach', 'viewpoint', 'hill', 'waterfall', 'park', 'trekking'].includes(cat) || vector.indoorSuitability <= 30;

  return {
    placeId: place.id || place.name,
    placeName: place.name,
    category: cat,
    vector,
    attributes: {
      indoorOutdoor: isIndoor ? 'indoor' : isOutdoor ? 'outdoor' : 'hybrid',
      weatherSensitivity: isOutdoor ? 'high' : isIndoor ? 'low' : 'moderate',
      walkingLoadM: isOutdoor ? 800 : isIndoor ? 400 : 500,
      typicalVisitMinutes: Number(place.vt || place.visitMinutes || 60),
      tourismTier: place.tourismTier || (rating >= 4.5 ? 'A' : 'B'),
    },
    evidence,
    confidence: 85,
    source: 'curated_prior',
    method: 'CATEGORY_EXPERIENCE_PRIOR',
    provenance: PROVENANCE_LAYERS.CURATED_PRIOR,
    provenanceLayers: {
      curatedPrior: { ...vector },
      observedData: place.observedData || null,
      userBehavior: place.userBehavior || null,
      modelOutput: place.modelOutput || null,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Computes Cosine Similarity between two experience vectors (range 0 to 1.0).
 */
function calculateFingerprintSimilarity(fpA, fpB) {
  const vA = fpA.vector || fpA;
  const vB = fpB.vector || fpB;
  const canonicalKeys = ['scenic', 'photography', 'culture', 'family', 'food', 'shopping', 'adventure', 'relaxation'];
  const allKeys = Object.keys(vA).length >= 8 ? Object.keys(vA).filter(k => vB[k] != null) : canonicalKeys;
  const keys = allKeys.length >= 4 ? allKeys : canonicalKeys;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  keys.forEach(k => {
    const a = Number(vA[k] || 0);
    const b = Number(vB[k] || 0);
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  });

  if (normA === 0 || normB === 0) return 0;
  const cosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1.0, Math.round(cosine * 100) / 100));
}

/**
 * Finds similar destinations ("Places like this").
 */
function findSimilarDestinations(targetPlace, candidatePlaces = [], limit = 3) {
  const targetFp = computeDestinationFingerprint(targetPlace);
  const targetId = String(targetPlace.id || targetPlace.name).toLowerCase();

  const scored = candidatePlaces
    .filter(p => String(p.id || p.name).toLowerCase() !== targetId)
    .map(p => {
      const fp = computeDestinationFingerprint(p);
      const sim = calculateFingerprintSimilarity(targetFp, fp);
      return {
        id: p.id || p.name,
        name: p.name,
        category: p.cat || p.category,
        similarityScore: Math.round(sim * 100),
        fingerprint: fp,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore);

  return scored.slice(0, limit);
}

/**
 * Finds differentiated destinations ("Show me something completely different").
 */
function findDifferentiatedDestinations(targetPlace, candidatePlaces = [], limit = 3) {
  const targetFp = computeDestinationFingerprint(targetPlace);
  const targetId = String(targetPlace.id || targetPlace.name).toLowerCase();

  const scored = candidatePlaces
    .filter(p => String(p.id || p.name).toLowerCase() !== targetId)
    .map(p => {
      const fp = computeDestinationFingerprint(p);
      const sim = calculateFingerprintSimilarity(targetFp, fp);
      return {
        id: p.id || p.name,
        name: p.name,
        category: p.cat || p.category,
        contrastScore: Math.round((1.0 - sim) * 100),
        fingerprint: fp,
      };
    })
    .sort((a, b) => b.contrastScore - a.contrastScore);

  return scored.slice(0, limit);
}

module.exports = {
  PROVENANCE_LAYERS,
  computeDestinationFingerprint,
  calculateFingerprintSimilarity,
  findSimilarDestinations,
  findDifferentiatedDestinations,
};
