'use strict';

/**
 * services/travelIntelligence/contextEngine.js
 * Canonical Intelligence Context Engine & Holistic Experience Evaluator.
 *
 * Answers:
 * "What is the best experience for THIS traveller, at THIS place, at THIS moment, under THESE conditions?"
 *
 * Synthesizes:
 * TIME + PLACE + TRAVELLER + WEATHER + TRAFFIC + CROWD + SCENIC + ROUTE + EVENTS + COMFORT + PROVENANCE
 */

const { sanitizeDnaProfile, computeDnaMatch } = require('./personalTravelDna');
const { computeDestinationFingerprint } = require('./destinationFingerprints');
const { distKm } = require('../../utils/geo');

const PROVENANCE_SOURCES = Object.freeze({
  LIVE_TRAFFIC: 'LIVE_TRAFFIC',
  PREDICTED_TRAFFIC: 'PREDICTED_TRAFFIC',
  HISTORICAL_TRAFFIC: 'HISTORICAL_TRAFFIC',
  STATIC_ROUTE_ESTIMATE: 'STATIC_ROUTE_ESTIMATE',
  OBSERVED_WEATHER: 'OBSERVED_WEATHER',
  WEATHER_FORECAST: 'WEATHER_FORECAST',
  HISTORICAL_CROWD: 'HISTORICAL_CROWD',
  ML_CROWD_MODEL: 'ML_CROWD_MODEL',
  ASTRONOMICAL_SOLAR: 'ASTRONOMICAL_SOLAR',
  CURATED_PRIOR: 'CURATED_PRIOR',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Constructs a Canonical Intelligence Context Object.
 */
function createIntelligenceContext(opts = {}) {
  const {
    traveler = {},
    destination = {},
    currentTime = new Date(),
    projectedArrival = {},
    weather = null,
    crowd = null,
    traffic = null,
    route = null,
    scenic = null,
    openingHours = null,
    mealContext = null,
    comfort = null,
    budget = null,
    events = null,
  } = opts;

  const dna = sanitizeDnaProfile(traveler.dna || traveler.dnaProfile);
  const fingerprint = destination.fingerprint || computeDestinationFingerprint(destination);
  const [lat, lon] = destination.coords || [20.5937, 78.9629];

  // Geodesic vs road distance
  let geodesicDistanceKm = null;
  if (opts.originCoords && Array.isArray(opts.originCoords) && Array.isArray(destination.coords)) {
    geodesicDistanceKm = Math.round(distKm(opts.originCoords[0], opts.originCoords[1], destination.coords[0], destination.coords[1]) * 10) / 10;
  }

  const nowIso = currentTime instanceof Date ? currentTime.toISOString() : new Date(currentTime).toISOString();

  return {
    traveler: {
      dna,
      personas: traveler.personas || traveler.persona || [],
      tripMode: traveler.tripMode || 'solo',
      budgetTier: traveler.budgetTier || 'moderate',
    },
    destination: {
      id: destination.id || destination.placeId || destination.name,
      name: destination.name || 'Unnamed Place',
      category: String(destination.cat || destination.category || 'default').toLowerCase(),
      coords: [lat, lon],
      fingerprint,
      tourismTier: destination.tourismTier || 'A',
      rating: Number(destination.rating || 4.2),
      isSunsetSpot: !!destination.is_sunset_spot,
      isSunriseSpot: !!destination.is_sunrise_spot,
    },
    currentTime: nowIso,
    projectedArrival: {
      minuteOfDay: projectedArrival.minuteOfDay ?? 720,
      timeString: projectedArrival.timeString || '12:00',
      daypart: projectedArrival.daypart || 'afternoon',
      isGoldenHour: !!projectedArrival.isGoldenHour,
      solarTimes: projectedArrival.solarTimes || null,
    },
    weather: {
      condition: weather?.condition || 'Clear',
      tempC: weather?.tempC ?? 28,
      apparentTempC: weather?.apparentTempC ?? weather?.tempC ?? 28,
      humidity: weather?.humidity ?? 60,
      rainRisk: weather?.rainRisk || (/rain/i.test(weather?.condition || '') ? 'HIGH' : 'LOW'),
      windKph: weather?.windKph ?? 12,
      status: weather?.status || (weather?.tempC >= 40 || /storm|heavy rain/i.test(weather?.condition || '') ? 'POOR' : 'GOOD'),
      freshness: weather?.freshness || 'observed',
    },
    crowd: {
      level: crowd?.level || 'Moderate',
      score: crowd?.score ?? crowd?.crowdScore ?? 50,
      estimatedQueueMinutes: crowd?.estimatedQueueMinutes ?? 0,
      queueDescriptor: crowd?.queueDescriptor || null,
      source: crowd?.source || PROVENANCE_SOURCES.HISTORICAL_CROWD,
    },
    traffic: {
      travelMinutes: traffic?.travelMinutes ?? 15,
      freeFlowMinutes: traffic?.freeFlowMinutes ?? 12,
      trafficDelayMinutes: traffic?.trafficDelayMinutes ?? 3,
      etaBreakdown: traffic?.etaBreakdown || `${traffic?.travelMinutes || 15}m (estimated)`,
      trafficTransition: traffic?.trafficTransition || '🟢 Low Traffic',
      trafficLevel: traffic?.trafficLevel || 'Low',
      roadDistanceKm: traffic?.distanceKm ?? (geodesicDistanceKm ? Math.round(geodesicDistanceKm * 1.3 * 10) / 10 : null),
      geodesicDistanceKm,
      source: traffic?.source === 'live' || traffic?.source === 'live_traffic'
        ? PROVENANCE_SOURCES.LIVE_TRAFFIC
        : PROVENANCE_SOURCES.STATIC_ROUTE_ESTIMATE,
    },
    route: {
      corridorType: route?.corridorType || 'URBAN_ARTERIAL',
      transitModeRecommended: route?.transitModeRecommended || traffic?.transitRecommendation || null,
      rushHourActive: !!(traffic?.rushHourActive || route?.rushHourActive),
    },
    scenic: {
      score: scenic?.scenicScore ?? scenic?.score ?? 50,
      goldenHourRating: scenic?.goldenHourRating ?? 0,
      isBestScenicWindow: !!(scenic?.bestScenicWindow && scenic.bestScenicWindow.isActive),
      reasons: scenic?.reasons || [],
    },
    openingHours: {
      isOpen: openingHours?.isOpenNow ?? openingHours?.isOpen ?? true,
      status: openingHours?.status || 'OPEN',
      minutesToClose: openingHours?.minutesToClose ?? null,
    },
    mealContext: {
      isMealTime: !!mealContext?.isMealTime,
      mealType: mealContext?.mealType || null,
      signatureDish: mealContext?.signatureDish || null,
    },
    comfort: {
      heatRisk: comfort?.heatRisk || (weather?.apparentTempC >= 38 ? 'HIGH' : 'LOW'),
      indoorRecommended: comfort?.indoorRecommended || (weather?.apparentTempC >= 38 || /heavy rain/i.test(weather?.condition || '')),
      walkingLoadScore: comfort?.walkingLoadScore ?? 50,
    },
    budget: {
      estimatedCost: budget?.estimatedCost ?? 0,
      budgetCompliant: budget?.budgetCompliant !== false,
    },
    events: {
      festivals: events?.festivals || [],
      crowdMultiplier: events?.crowdMultiplier ?? 1.0,
    },
    provenance: {
      generatedAt: nowIso,
      sources: {
        travelerDna: dna.sources,
        destination: 'CANONICAL_POI_CATALOG',
        weather: weather ? (weather.isObserved ? PROVENANCE_SOURCES.OBSERVED_WEATHER : PROVENANCE_SOURCES.WEATHER_FORECAST) : PROVENANCE_SOURCES.UNKNOWN,
        traffic: traffic?.source || PROVENANCE_SOURCES.STATIC_ROUTE_ESTIMATE,
        crowd: crowd?.source || PROVENANCE_SOURCES.HISTORICAL_CROWD,
        solar: PROVENANCE_SOURCES.ASTRONOMICAL_SOLAR,
      },
      confidence: 85,
      limitations: [
        'Transit times utilize traffic-calibrated corridor kinematics; real-world conditions may vary during unannounced road closures.',
      ],
    },
  };
}

/**
 * Evaluates the holistic experience score for a Canonical Intelligence Context.
 *
 * @param {Object} context - Canonical Intelligence Context object
 * @returns {Object} Evaluation summary
 */
function evaluateContextExperience(context) {
  if (!context || !context.destination) {
    return {
      experienceScore: 0,
      fitClassification: 'INVALID',
      reasons: ['Missing destination context'],
      advisories: [],
      confidence: 0,
    };
  }

  const {
    traveler,
    destination,
    weather,
    crowd,
    traffic,
    scenic,
    openingHours,
    mealContext,
    comfort,
    budget,
  } = context;

  // 1. Hard Constraints Check
  if (openingHours && openingHours.isOpen === false) {
    return {
      experienceScore: 0,
      fitClassification: 'INVALID',
      reasons: ['Destination is closed during projected arrival time'],
      advisories: ['Consider visiting an alternative open attraction nearby.'],
      confidence: 95,
      constraintsSatisfied: { open: false, budget: budget?.budgetCompliant },
    };
  }

  // 2. Traveler DNA Alignment
  const dnaMatch = computeDnaMatch(destination, traveler?.dna);
  const dnaScore = dnaMatch.score;

  // 3. Time & Scenic Scoring
  const scenicScore = Number.isFinite(scenic?.score) ? scenic.score : 50;

  // 4. Weather & Comfort Scoring
  let weatherScore = 75;
  const advisories = [];
  if (weather) {
    if (weather.status === 'POOR') {
      weatherScore = destination.fingerprint?.vector?.indoorSuitability >= 80 ? 70 : 25;
      advisories.push('Adverse weather conditions — indoor experience recommended');
    } else if (comfort?.heatRisk === 'HIGH') {
      weatherScore = destination.fingerprint?.vector?.heatSuitability >= 70 ? 75 : 45;
      advisories.push('High apparent temperature during this window — stay hydrated');
    } else {
      weatherScore = 90;
    }
  }

  // 5. Crowd & Queue Penalty
  let crowdScore = 80;
  if (crowd) {
    if (crowd.level === 'Very High' || crowd.score >= 80) {
      crowdScore = 40;
      advisories.push(`Heavy crowd expected (${crowd.queueDescriptor || 'Long queues'})`);
    } else if (crowd.level === 'High' || crowd.score >= 65) {
      crowdScore = 60;
    } else if (crowd.level === 'Low' || crowd.score <= 35) {
      crowdScore = 95;
    }
  }

  // 6. Route & Transit Efficiency
  let routeScore = 80;
  if (traffic) {
    if (traffic.trafficDelayMinutes >= 15 || traffic.trafficLevel === 'Heavy') {
      routeScore = 55;
      advisories.push(`Congested transit corridor (${traffic.trafficTransition})`);
    } else if (traffic.trafficLevel === 'Low') {
      routeScore = 95;
    }
  }

  // 7. Meal & Culinary Synergy
  let mealBonus = 0;
  if (mealContext?.isMealTime && destination.category === 'food') {
    mealBonus = 15;
  }

  // Multidimensional Weighted Synthesis
  const weightedScore = Math.round(
    dnaScore * 0.30 +
    scenicScore * 0.20 +
    weatherScore * 0.20 +
    crowdScore * 0.15 +
    routeScore * 0.15 +
    mealBonus
  );

  const finalScore = Math.max(10, Math.min(100, weightedScore));

  const reasons = [];
  if (dnaMatch.reasons && dnaMatch.reasons.length > 0) {
    reasons.push(dnaMatch.reasons[0]);
  }
  if (scenicScore >= 80) {
    reasons.push('Approaching optimal scenic / golden hour window');
  }
  if (weatherScore >= 80) {
    reasons.push('Favorable weather & comfort conditions');
  }
  if (crowdScore >= 85) {
    reasons.push('Low expected crowd with minimal queue wait');
  }
  if (traffic?.trafficLevel === 'Low') {
    reasons.push('Free-flowing route transit');
  }
  if (mealBonus > 0 && mealContext?.signatureDish) {
    reasons.push(`Signature dish available: ${mealContext.signatureDish.dish}`);
  }

  let fitClassification = 'GOOD';
  if (finalScore >= 85) fitClassification = 'EXCELLENT';
  else if (finalScore >= 65) fitClassification = 'GOOD';
  else if (finalScore >= 45) fitClassification = 'VIABLE';
  else fitClassification = 'UNSUITABLE';

  return {
    experienceScore: finalScore,
    fitClassification,
    dnaScore,
    scenicScore,
    weatherScore,
    crowdScore,
    routeScore,
    reasons: reasons.slice(0, 4),
    advisories,
    confidence: context.provenance?.confidence || 85,
    provenance: context.provenance,
  };
}

module.exports = {
  PROVENANCE_SOURCES,
  createIntelligenceContext,
  evaluateContextExperience,
};
