'use strict';

/**
 * services/travelIntelligence/decisionEngine.js
 *
 * Core Travel Intelligence Evaluator & Visit Decision Scorer.
 * Evaluates place candidates against live/historical temporal rules, weather,
 * scenic windows, crowd models, and transit heuristics.
 */

const rules = require('../../data/time-intelligence-rules.json');
const { t2m, getISTParts, getSeason, computeSunTimes, getDaypart, computeGoldenHours, inWindow, isInGoldenHour } = require('./timeEngine');
const { getOpeningStatus, categoryRules } = require('./openingHoursEngine');
const { computeCrowd, lookupHistoricalCrowd } = require('../crowd');
const { estimateTravel, recommendArrivalWindow, getTrafficMultiplier, getCityTrafficMultiplier } = require('./trafficEngine');
const { computeWeatherIntelligence, buildWeatherExperienceWindows } = require('./weatherEngine');
const { computeScenic } = require('./scenicEngine');
const { computeVisitScore, computeTimeScore, openingToScore, trafficToScore, computePreferenceScore } = require('./scoringEngine');
const { getCulturalRitualIntel } = require('./culturalRitualEngine');
const { getSignatureDish } = require('./signatureDishEngine');
const { getEntryProtocol } = require('./entryProtocolEngine');
const { computeConfidence } = require('./confidenceEngine');
const { buildExplanation, buildStatusLabel } = require('./explanationEngine');
const { generateExperienceWindows } = require('./experienceWindows');
const { createIntelligenceContext, evaluateContextExperience } = require('./contextEngine');

function getTravelIntelligence(place, now = new Date(), weather = null, options = {}) {
  // Attach historical crowd hints when not already provided on the place object
  if (!place.historicalCrowd) {
    const hist = lookupHistoricalCrowd(place, options.region || options.city || null);
    if (hist) place = { ...place, historicalCrowd: hist };
  }
  const cat = place.cat || 'default';
  const catRule = categoryRules(cat);
  const [lat, lon] = place.coords || [20.5937, 78.9629];
  const hasCoords = Array.isArray(place.coords) && place.coords.length >= 2 && Number.isFinite(place.coords[0]) && Number.isFinite(place.coords[1]);
  const ist = getISTParts(now);
  const nowMin = ist.minutesOfDay;
  const isWeekend = ist.dayIndex === 0 || ist.dayIndex === 6;
  const season = getSeason(ist.month);
  const sun = computeSunTimes(lat, lon, now);
  const golden = computeGoldenHours(sun.sunriseMin, sun.sunsetMin);
  const daypart = getDaypart(nowMin, sun.sunsetMin);
  const bestHours = place.best_hours || catRule.bestHours;
  const peakHours = place.peak_hours || catRule.peakHours;
  const isBestTimeNow = inWindow(nowMin, bestHours);
  const isPeakHourNow = inWindow(nowMin, peakHours);
  const ghState = isInGoldenHour(nowMin, golden);
  const opening = getOpeningStatus(place, now, sun);
  const crowd = computeCrowd({ daypart, isWeekend, isPeakHourNow, cat, month: ist.month, publicHoliday: !!options.publicHoliday, weather, historicalObservations: place.historicalCrowd || null, date: now, region: options.region || place.region || place.city || null });
  const weatherIntel = computeWeatherIntelligence(weather, place, daypart);
  const weatherWindows = buildWeatherExperienceWindows(weather, place);
  const scenic = computeScenic(place, { nowMin, sun, golden, weatherIntel, now });
  let traffic = null;
  const placeCity = options.region || options.city || place.region || place.city || null;
  if (options.fromCoords || options.liveTraffic) {
    traffic = estimateTravel({ fromCoords: options.fromCoords, toCoords: place.coords, departMin: nowMin, liveTraffic: options.liveTraffic || null, isFirstStop: !!options.isFirstStop, cityKey: placeCity });
  } else {
    const mult = placeCity ? getCityTrafficMultiplier(placeCity, nowMin) : getTrafficMultiplier(nowMin);
    traffic = { travelMinutes: null, distanceKm: null, congestionFactor: mult, trafficLevel: mult <= 1.05 ? 'Low' : mult <= 1.35 ? 'Moderate' : 'High', trafficRisk: mult <= 1.05 ? 'Low' : mult <= 1.35 ? 'Medium' : 'High', source: 'estimated', label: 'Area traffic heuristic (no origin provided)', confidence: 40 };
  }
  const openingScore = openingToScore(opening);
  const timeScore = computeTimeScore(place, { nowMin, isBestTimeNow, isPeakHourNow, daypart, goldenIn: ghState.any });
  const preferenceScore = computePreferenceScore(place, options.personas || [], options.tripMode || null);
  const trafficScore = trafficToScore(traffic);
  const scored = computeVisitScore({ weatherScore: weatherIntel.score, crowdScore: crowd.crowdScore, trafficScore, scenicScore: scenic.scenicScore, timeScore, openingScore, preferenceScore }, place);
  let targetStart = null, targetEnd = null;
  if (scenic.bestScenicWindow) {
    targetStart = scenic.bestScenicWindow.startMin ?? t2m(scenic.bestScenicWindow.start);
    targetEnd = scenic.bestScenicWindow.endMin ?? t2m(scenic.bestScenicWindow.end);
  } else if (bestHours?.[0]) {
    targetStart = t2m(bestHours[0][0]);
    targetEnd = t2m(bestHours[0][1]);
  }
  const travelMin = traffic?.travelMinutes ?? 20;
  const arrival = targetStart != null ? recommendArrivalWindow({ experienceStartMin: targetStart, experienceEndMin: targetEnd, travelMinutes: travelMin }) : null;
  const confidence = computeConfidence({
    hasWeather: !!(weather && (weather.tempC != null || weather.condition || weather.weathercode != null || weather.windKph != null)),
    hasCoords, hasOpeningHours: opening.dataQuality === 'provided',
    hasCategoryRules: !!rules.categories[cat],
    hasTrafficEstimate: traffic?.source === 'estimated' || traffic?.source === 'live',
    hasLiveTraffic: traffic?.source === 'live',
    hasHistoricalHint: !!(place.historicalCrowd && place.historicalCrowd.sampleSize),
  });

  const cultural = getCulturalRitualIntel(place, nowMin, ist.dayIndex);
  const signatureDish = getSignatureDish(place, options.region || place.region || place.city || '');
  const entryProtocol = getEntryProtocol(place);

  const placeNameLower = String(place.name || '').toLowerCase();
  const isCloudInversionSpot = /vanjangi|lambasingi/.test(placeNameLower);
  const cloudInversion = isCloudInversionSpot && nowMin >= 300 && nowMin <= 450;

  const isMiddaySolarHeat = nowMin >= 11 * 60 + 30 && nowMin <= 15 * 60 + 30;
  const isIndoorHaven = place.indoor_outdoor === 'indoor' || ['museum', 'cafe', 'food', 'shopping'].includes(cat);
  const thermalComfort = {
    isMiddayHaven: isMiddaySolarHeat && isIndoorHaven && weather && weather.tempC >= 32,
    isOutdoorHeatStress: isMiddaySolarHeat && !isIndoorHaven && weather && weather.tempC >= 34,
  };

  if (cultural?.isSanctumClosure) {
    scored.visitScore = Math.max(25, scored.visitScore - 35);
    scored.label = scored.visitScore >= 75 ? 'Good' : scored.visitScore >= 50 ? 'Fair' : 'Poor';
  } else if (cloudInversion) {
    scored.visitScore = Math.min(100, scored.visitScore + 18);
    scored.label = scored.visitScore >= 90 ? 'Exceptional' : 'Excellent';
  }

  const explanation = buildExplanation({
    visitScore: scored.visitScore,
    visitLabel: scored.label,
    opening,
    crowd,
    weather: weatherIntel,
    traffic,
    scenic,
    arrival,
    cultural,
    thermalComfort,
    cloudInversion,
  });
  const statusLabel = buildStatusLabel({
    opening,
    visitLabel: scored.label,
    crowd,
    weather: weatherIntel,
    scenic,
    daypart,
    nightAvailable: opening.nightAvailable,
    cultural,
    cloudInversion,
  });

  const badges = [];
  if (opening.isOpenNow === true) badges.push('🟢 Open');
  else if (opening.isOpenNow === false) badges.push('🔴 Closed');
  else badges.push('❓ Hours unknown');
  if (opening.status === 'CLOSING_SOON') badges.push('🟡 Closing Soon');
  if (place.is_sunrise_spot) badges.push('🌅 Best at Sunrise');
  if (place.is_sunset_spot) badges.push('🌇 Best at Sunset');
  if (cloudInversion) badges.push('☁️ Cloud Inversion Window');
  if (cultural?.isSanctumClosure) badges.push('🔒 Sanctum Rest (12:30–15:30)');
  if (thermalComfort.isMiddayHaven) badges.push('❄️ Midday Heat Refuge');
  if (cultural?.culturalBadge) badges.push(cultural.culturalBadge);
  if (weather && weather.tempC >= 38) badges.push('🔥 Hot Weather');
  if (weather && /rain/i.test(weather.condition || '')) badges.push('🌧 Rain Alert');
  if (crowd.level === 'High' || crowd.level === 'Very High') badges.push('👥 Peak Crowd');
  if (weather && weather.windKph != null && weather.windKph >= 30 && (cat === 'beach' || cat === 'scenic' || place.is_sunset_spot)) badges.push('💨 Strong Wind');
  if (isBestTimeNow && opening.isOpenNow) badges.push('✨ Best Time Now');
  if (scored.visitScore >= 85) badges.push('⭐ Top Recommendation');
  const experienceWindows = options.disableExperienceWindows ? { windows: [], source: 'suppressed' } : generateExperienceWindows({
    referenceDate: now,
    referenceStartMin: nowMin,
    currentMin: nowMin,
    startMin: Math.max(6 * 60, nowMin - 2 * 60),
    endMin: Math.min(22 * 60, nowMin + 8 * 60),
    stepMin: 60,
    weatherResolver: (at) => {
      const hourly = Array.isArray(weather?.hourly) ? weather.hourly : [];
      if (!hourly.length) return null;
      const target = at.getTime();
      let best = null;
      let bestDelta = Infinity;
      for (const item of hourly) {
        const t = new Date(item.time || item.timestamp || item.datetime || NaN);
        const delta = Math.abs(t.getTime() - target);
        if (!Number.isNaN(t.getTime()) && delta < bestDelta) {
          best = item;
          bestDelta = delta;
        }
      }
      return bestDelta <= 90 * 60 * 1000 ? best : null;
    },
    place,
    daypart,
    season,
    holiday: !!options.publicHoliday,
    regionalCalendar: options.regionalCalendar || null,
    city: options.city || place.city || null,
    region: options.region || place.region || null,
    state: options.state || place.state || null,
    scenicContext: { sun, golden, weatherIntel },
  });

  const notifications = [];
  if (opening.isOpenNow && opening.minutesToClose != null && opening.minutesToClose <= 60) notifications.push(`This attraction closes in ${opening.minutesToClose} minutes.`);
  if (place.is_sunset_spot && nowMin < sun.sunsetMin && sun.sunsetMin - nowMin <= 30) notifications.push(`Golden hour starts in ${sun.sunsetMin - nowMin} minutes.`);
  if (crowd.level === 'High' || crowd.level === 'Very High') notifications.push('Heavy crowd expected — consider visiting earlier or later.');
  if (cultural?.isSanctumClosed) notifications.push(cultural.recommendation);
  if (opening.isOpenNow === false && opening.minutesToOpen != null) {
    const h = Math.floor(opening.minutesToOpen / 60), m = opening.minutesToOpen % 60;
    notifications.push(`Opens in ${h > 0 ? `${h}h ${m}m` : `${m}m`} — best time around ${sun.sunrise}.`);
  }

  const recommendations = [];
  if (place.is_sunrise_spot && daypart === 'earlyMorning') recommendations.push('Sunrise viewpoint — arrive 15 min before sunrise');
  if (place.is_sunset_spot && (daypart === 'evening' || ghState.evening)) recommendations.push('Golden hour photography tips');
  if (cultural?.recommendation && !cultural.isSanctumClosed) recommendations.push(cultural.recommendation);
  if (signatureDish?.mustTryReason) recommendations.push(`Must-try nearby: ${signatureDish.dishName} at ${signatureDish.iconicSpot}`);
  if (daypart === 'earlyMorning') recommendations.push('Suggest breakfast nearby');
  if (daypart === 'afternoon') recommendations.push('Suggest lunch restaurants nearby');
  if (weatherIntel.warnings?.length) recommendations.push(...weatherIntel.warnings.slice(0, 2));
  if (arrival?.recommendedDeparture) recommendations.push(`Leave around ${arrival.recommendedDeparture} to arrive for the best window`);

  const bestSeason = place.season || catRule.season;
  const seasonalNote = bestSeason && bestSeason !== 'any' && bestSeason !== season
    ? `Best experienced in ${bestSeason} — visiting off-season is still fine, just set expectations`
    : bestSeason && bestSeason !== 'any' ? `Peak season right now (${bestSeason})` : null;

    const intelligenceContext = createIntelligenceContext({
      traveler: { dna: options.travelerDna || null, personas: options.personas || [] },
      destination: place,
      currentTime: now,
      projectedArrival: { minuteOfDay: nowMin, daypart, isGoldenHour: ghState.any, solarTimes: sun },
      weather: weatherIntel,
      crowd,
      traffic,
      scenic,
      openingHours: opening,
      mealContext: { isMealTime: isBestTimeNow && cat === 'food', signatureDish },
      comfort: { heatRisk: weather && weather.tempC >= 38 ? 'HIGH' : 'LOW', indoorRecommended: weather && (weather.tempC >= 38 || /heavy rain/i.test(weather.condition || '')) },
    });

    return {
      name: place.name,
      category: cat,
      visitScore: scored.visitScore,
      visitLabel: scored.label,
      scoringProfile: scored.profile,
      components: scored.components,
      isOpenNow: opening.isOpenNow,
      statusLabel,
      minutesToClose: opening.minutesToClose,
      minutesToOpen: opening.minutesToOpen,
      openTime: opening.openTime,
      closeTime: opening.closeTime,
      opening,
      sunrise: sun.sunrise,
      sunset: sun.sunset,
      daypart,
      isBestTimeNow,
      isPeakHourNow,
      goldenHours: golden,
      inGoldenHour: ghState,
      season,
      bestSeason,
      seasonalNote,
      nightAvailable: opening.nightAvailable,
      weeklyHoliday: opening.weeklyHoliday,
      crowdLevel: crowd.level,
      crowd: { level: crowd.level, score: crowd.crowdScore, crowdBadge: crowd.crowdBadge, isPeakWindow: crowd.isPeakWindow, bestOffPeakWindow: crowd.bestOffPeakWindow, source: crowd.source, reason: crowd.reason, factors: crowd.factors },
      weather: { ...weatherIntel, experienceWindows: weatherWindows },
      traffic,
      scenic,
      arrival,
      preferenceScore,
      confidence,
      explanation,
      recommendations,
      cultural,
      cloudInversion: !!cloudInversion,
      thermalComfort,
      signatureDish,
      entryProtocol,
      weatherWarnings: weatherIntel.warnings || [],
      badges,
      notifications,
      experienceWindows,
      intelligenceContext,
      dataQuality: {
        opening: opening.dataQuality,
        crowd: crowd.source,
        weather: weatherIntel.source,
        traffic: traffic?.source || 'unavailable',
        scenic: 'rule-based',
        dataFreshness: {
          computedAt: now.toISOString(),
          weather: weatherIntel.source === 'forecast' ? 'forecast' : weatherIntel.source,
          traffic: traffic?.freshness || (traffic?.source === 'live_traffic' ? 'request_time' : traffic?.source || 'unavailable'),
        },
      },
      dataSources: {
        crowd: crowd.source,
        weather: weatherIntel.source,
        traffic: traffic?.provider || traffic?.source || 'unavailable',
        scenic: 'astronomical_rules',
      },
      computedAt: now.toISOString(),
    };
  }

function clamp(val, min = 0, max = 100) {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

const SOURCE_QUALITY_MAP = {
  live_traffic: 1.0,
  observed: 1.0,
  forecast: 0.88,
  predicted: 0.88,
  'historical-db': 0.78,
  route_estimate: 0.68,
  estimated: 0.68,
  astronomical_rules: 0.82,
  unavailable: 0.25,
};

function sourceQuality(source) {
  if (source && SOURCE_QUALITY_MAP[source] !== undefined) {
    return SOURCE_QUALITY_MAP[source];
  }
  return 0.55;
}

function freshnessFactor(ageMinutes) {
  if (!Number.isFinite(ageMinutes)) return 0.7;
  if (ageMinutes <= 15) return 1.0;
  if (ageMinutes <= 60) return 0.95;
  if (ageMinutes <= 180) return 0.85;
  if (ageMinutes <= 720) return 0.7;
  return 0.55;
}

function signalConfidence(opts = {}) {
  const source = opts.source || 'unavailable';
  const sq = sourceQuality(source);
  const ff = freshnessFactor(opts.ageMinutes);
  let base = 100 * sq * ff;
  if (Number.isFinite(opts.samples) && opts.samples > 0) {
    const bonus = Math.min(12, Math.log10(opts.samples) * 3);
    base += bonus;
  }
  if (opts.calibration != null && Number.isFinite(opts.calibration)) {
    const clampedCal = clamp(opts.calibration, 0.5, 1.05);
    base *= clampedCal;
  }
  return clamp(Math.round(base), 0, 100);
}

function weightedMean(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  let totalWeight = 0;
  let sum = 0;
  for (const e of entries) {
    if (e && Number.isFinite(e.value) && Number.isFinite(e.weight) && e.weight > 0) {
      sum += e.value * e.weight;
      totalWeight += e.weight;
    }
  }
  if (totalWeight <= 0) return 0;
  return sum / totalWeight;
}

function uncertaintyFromSignals(signals = []) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return { score: 70, band: 30 };
  }
  const valid = signals.map(s => Number(s?.confidence)).filter(Number.isFinite);
  if (valid.length === 0) {
    return { score: 70, band: 30 };
  }
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  let spread = 0;
  if (valid.length > 1) {
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    spread = (max - min) * 0.25;
  }
  const rawBand = (100 - avg) * 0.4 + spread;
  const band = clamp(Math.round(rawBand), 4, 45);
  const score = clamp(Math.round(avg), 0, 100);
  return { score, band };
}

const DECISION_WEIGHTS = {
  experience: 0.33,
  temporalFit: 0.22,
  routeFit: 0.15,
  robustness: 0.12,
  preferenceFit: 0.08,
  diversity: 0.05,
  openingFeasibility: 0.05,
};

function computeDecisionScore(inputs = {}) {
  const components = {
    experience: clamp(inputs.experience ?? 50),
    temporalFit: clamp(inputs.temporalFit ?? 50),
    routeFit: clamp(inputs.routeFit ?? 50),
    robustness: clamp(inputs.robustness ?? 50),
    preferenceFit: clamp(inputs.preferenceFit ?? 50),
    diversity: clamp(inputs.diversity ?? 50),
    openingFeasibility: clamp(inputs.openingFeasibility ?? 50),
  };

  let totalScore = 0;
  for (const [key, weight] of Object.entries(DECISION_WEIGHTS)) {
    totalScore += components[key] * weight;
  }

  return {
    score: Math.round(totalScore * 100) / 100,
    components,
    weights: { ...DECISION_WEIGHTS },
  };
}

function scenarioRobustness(baseScore, uncertaintyBand, scenarioCount = 5) {
  const count = clamp(scenarioCount, 3, 9);
  const band = clamp(uncertaintyBand, 1, 100);
  const base = clamp(baseScore, 0, 100);
  const worstCase = clamp(Math.round(base - band), 0, 100);
  const bestCase = clamp(Math.round(base + band), 0, 100);
  const expected = base;
  const scenarios = [];
  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);
    scenarios.push(clamp(Math.round(worstCase + frac * (bestCase - worstCase)), 0, 100));
  }
  const robustness = Math.round(worstCase * 0.55 + expected * 0.35 + bestCase * 0.10);
  return { robustness, worstCase, expected, bestCase, scenarios };
}

function temporalRegret(arrivalScore, futureScore) {
  const arr = clamp(arrivalScore, 0, 100);
  const fut = clamp(futureScore, 0, 100);
  const gap = Math.max(0, fut - arr);
  let label = 'LOW_OPPORTUNITY';
  if (gap >= 20) label = 'HIGH_OPPORTUNITY_TO_WAIT';
  else if (gap >= 10) label = 'MODERATE_OPPORTUNITY';
  return {
    regret: gap,
    opportunity: gap,
    label,
  };
}

function computeTravelValueScore(inputs = {}) {
  const intent = (inputs.intent || 'balanced').toLowerCase();

  let weights = {
    scenicValue: 0.25,
    temporalSuitability: 0.25,
    tourismQuality: 0.25,
    dnaMatch: 0.15,
    crowdPenalty: 0.10,
  };

  if (intent === 'photography' || intent === 'scenic') {
    weights = {
      scenicValue: 0.28,
      temporalSuitability: 0.28,
      tourismQuality: 0.20,
      dnaMatch: 0.14,
      crowdPenalty: 0.10,
    };
  } else if (intent === 'food' || intent === 'culinary') {
    weights = {
      tourismQuality: 0.32,
      dnaMatch: 0.28,
      temporalSuitability: 0.20,
      scenicValue: 0.10,
      crowdPenalty: 0.10,
    };
  }

  const scenic = clamp(inputs.scenicValue ?? 50);
  const temporal = clamp(inputs.temporalSuitability ?? 50);
  const tourism = clamp(inputs.tourismQuality ?? 50);
  const dna = clamp(inputs.dnaMatch ?? (inputs.intent ? 70 : 50));
  const crowd = clamp(inputs.crowdPenalty ?? 0);

  const rawScore =
    scenic * weights.scenicValue +
    temporal * weights.temporalSuitability +
    tourism * weights.tourismQuality +
    dna * weights.dnaMatch -
    crowd * (weights.crowdPenalty || 0);

  const score = clamp(Math.round(rawScore * 10) / 10, 0, 100);
  const reasons = [];

  if (scenic >= 80) reasons.push('High visual and landscape quality');
  if (temporal >= 80) reasons.push('Optimal temporal arrival fit');
  if (tourism >= 80) reasons.push('High-rated iconic tourism value');
  if (reasons.length === 0) reasons.push('Balanced itinerary candidate');

  return {
    score,
    weights,
    reasons,
    intent,
  };
}

module.exports = {
  getTravelIntelligence,
  clamp,
  sourceQuality,
  freshnessFactor,
  signalConfidence,
  weightedMean,
  uncertaintyFromSignals,
  computeDecisionScore,
  scenarioRobustness,
  temporalRegret,
  computeTravelValueScore,
  createIntelligenceContext,
  evaluateContextExperience,
};


