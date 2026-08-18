// Travel Intelligence Engine — orchestrator
const rules = require('../../data/time-intelligence-rules.json');
const { t2m, m2t, getISTParts, getSeason, computeSunTimes, getDaypart, computeGoldenHours, inWindow, isInGoldenHour } = require('./timeEngine');
const { getOpeningStatus, categoryRules } = require('./openingHoursEngine');
const { computeCrowd, predictCrowdLegacy } = require('./crowdEngine');
const { estimateTravel, recommendArrivalWindow, getTrafficMultiplier } = require('./trafficEngine');
const { computeWeatherIntelligence, buildWeatherExperienceWindows } = require('./weatherEngine');
const { computeScenic } = require('./scenicEngine');
const { computeVisitScore, computeTimeScore, openingToScore, trafficToScore, computePreferenceScore } = require('./scoringEngine');
const { computeConfidence } = require('./confidenceEngine');
const { buildExplanation, buildStatusLabel } = require('./explanationEngine');
const itineraryEngine = require('./itineraryEngine');
const { buildMultiDayItinerary } = require('./multiDayPlanner');
const festivalEngine = require('./festivalEngine');
const historicalCrowdStore = require('./historicalCrowdStore');
const { generateExperienceWindows } = require('./experienceWindows');

function getTravelIntelligence(place, now = new Date(), weather = null, options = {}) {
  // Attach historical crowd hints when not already provided on the place object
  if (!place.historicalCrowd) {
    const hist = historicalCrowdStore.lookupHistoricalCrowd(place, options.region || options.city || null);
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
  if (options.fromCoords || options.liveTraffic) {
    traffic = estimateTravel({ fromCoords: options.fromCoords, toCoords: place.coords, departMin: nowMin, liveTraffic: options.liveTraffic || null, isFirstStop: !!options.isFirstStop });
  } else {
    const mult = getTrafficMultiplier(nowMin);
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
  const explanation = buildExplanation({ visitScore: scored.visitScore, visitLabel: scored.label, opening, crowd, weather: weatherIntel, traffic, scenic, arrival });
  const statusLabel = buildStatusLabel({ opening, visitLabel: scored.label, crowd, weather: weatherIntel, scenic, daypart, nightAvailable: opening.nightAvailable });
  const badges = [];
  if (opening.isOpenNow === true) badges.push('🟢 Open');
  else if (opening.isOpenNow === false) badges.push('🔴 Closed');
  else badges.push('❓ Hours unknown');
  if (opening.status === 'CLOSING_SOON') badges.push('🟡 Closing Soon');
  if (place.is_sunrise_spot) badges.push('🌅 Best at Sunrise');
  if (place.is_sunset_spot) badges.push('🌇 Best at Sunset');
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
    evaluate: (at, forecastWeather) => getTravelIntelligence(place, at, forecastWeather || null, {
      ...options,
      disableExperienceWindows: true,
    }),
  });
  const notifications = [];
  if (opening.isOpenNow && opening.minutesToClose != null && opening.minutesToClose <= 60) notifications.push(`This attraction closes in ${opening.minutesToClose} minutes.`);
  if (place.is_sunset_spot && nowMin < sun.sunsetMin && sun.sunsetMin - nowMin <= 30) notifications.push(`Golden hour starts in ${sun.sunsetMin - nowMin} minutes.`);
  if (crowd.level === 'High' || crowd.level === 'Very High') notifications.push('Heavy crowd expected — consider visiting earlier or later.');
  if (opening.isOpenNow === false && opening.minutesToOpen != null) {
    const h = Math.floor(opening.minutesToOpen / 60), m = opening.minutesToOpen % 60;
    notifications.push(`Opens in ${h > 0 ? `${h}h ${m}m` : `${m}m`} — best time around ${sun.sunrise}.`);
  }
  const recommendations = [];
  if (place.is_sunrise_spot && daypart === 'earlyMorning') recommendations.push('Sunrise viewpoint — arrive 15 min before sunrise');
  if (place.is_sunset_spot && (daypart === 'evening' || ghState.evening)) recommendations.push('Golden hour photography tips');
  if (daypart === 'earlyMorning') recommendations.push('Suggest breakfast nearby');
  if (daypart === 'afternoon') recommendations.push('Suggest lunch restaurants nearby');
  if (weatherIntel.warnings?.length) recommendations.push(...weatherIntel.warnings.slice(0, 2));
  if (arrival?.recommendedDeparture) recommendations.push(`Leave around ${arrival.recommendedDeparture} to arrive for the best window`);
  const bestSeason = place.season || catRule.season;
  const seasonalNote = bestSeason && bestSeason !== 'any' && bestSeason !== season
    ? `Best experienced in ${bestSeason} — visiting off-season is still fine, just set expectations`
    : bestSeason && bestSeason !== 'any' ? `Peak season right now (${bestSeason})` : null;
  return {
    name: place.name, category: cat, visitScore: scored.visitScore, visitLabel: scored.label, scoringProfile: scored.profile, components: scored.components,
    isOpenNow: opening.isOpenNow, statusLabel, minutesToClose: opening.minutesToClose, minutesToOpen: opening.minutesToOpen,
    openTime: opening.openTime, closeTime: opening.closeTime, opening,
    sunrise: sun.sunrise, sunset: sun.sunset, daypart, isBestTimeNow, isPeakHourNow, goldenHours: golden, inGoldenHour: ghState,
    season, bestSeason, seasonalNote, nightAvailable: opening.nightAvailable, weeklyHoliday: opening.weeklyHoliday,
    crowdLevel: crowd.level, crowd: { level: crowd.level, score: crowd.crowdScore, source: crowd.source, reason: crowd.reason, factors: crowd.factors },
    weather: { ...weatherIntel, experienceWindows: weatherWindows }, traffic, scenic, arrival, preferenceScore, confidence, explanation, recommendations,
    weatherWarnings: weatherIntel.warnings || [], badges, notifications, experienceWindows,
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
function getBatchTravelIntelligence(places, now = new Date(), weather = null, options = {}) {
  return (places || []).map((p) => getTravelIntelligence(p, now, weather, options));
}
function suggestOpenAlternatives(closedPlace, allPlaces, now = new Date(), weather = null, limit = 3) {
  return (allPlaces || []).filter((p) => p.name !== closedPlace.name && p.cat === closedPlace.cat)
    .map((p) => ({ place: p, intel: getTravelIntelligence(p, now, weather) }))
    .filter((x) => x.intel.isOpenNow === true).slice(0, limit).map((x) => x.place.name);
}
async function getTravelIntelligenceAsync(place, now = new Date(), weather = null, options = {}) {
  const { estimateTravelAsync } = require('./trafficEngine');
  // Prefer DB historical crowd when available
  try {
    const hist = await historicalCrowdStore.lookupHistoricalCrowdAsync(place, options.region || options.city || null);
    if (hist) place = { ...place, historicalCrowd: hist };
  } catch (_e) { /* keep sync JSON path inside getTravelIntelligence */ }

  const base = getTravelIntelligence(place, now, weather, { ...options, liveTraffic: options.liveTraffic || null });

  // Blend feedback-trained ML logistic model (or rating prior if under-trained)
  try {
    const learner = require('./crowdLearner');
    const histScore = place.historicalCrowd?.avgScore ?? place.historicalCrowd?.score;
    const learned = await learner.getMlOrPriorCrowd(
      place.name,
      options.city || place.city || options.region || '',
      {
        daypart: base.daypart || base.time?.daypart,
        isWeekend: base.isWeekend,
        isPeakHourNow: base.isPeakHourNow,
        month: new Date(now).getMonth() + 1,
        cat: place.cat || 'default',
        historicalScore: histScore,
      }
    );
    if (learned && learned.score != null) {
      base.crowd = learner.blendLearnedCrowd(base.crowd, learned);
      if (learned.source) base.crowd.mlSource = learned.source;
    }
  } catch (_e) { /* learner is optional */ }

  // Refresh traffic with live routing when origin provided
  if (options.fromCoords && place.coords && options.enableLiveRouting !== false) {
    try {
      const ist = require('./timeEngine').getISTParts(now);
      const traffic = await estimateTravelAsync({
        fromCoords: options.fromCoords,
        toCoords: place.coords,
        departMin: ist.minutesOfDay,
        liveTraffic: options.liveTraffic || null,
        isFirstStop: !!options.isFirstStop,
        enableLiveRouting: options.enableLiveRouting !== false,
      });
      base.traffic = traffic;
      base.dataQuality = { ...base.dataQuality, traffic: traffic.source };
      if (traffic.source === 'live') {
        const conf = require('./confidenceEngine').computeConfidence({
          hasWeather: !!(weather && (weather.tempC != null || weather.condition)),
          hasCoords: true,
          hasOpeningHours: base.opening?.dataQuality === 'provided',
          hasCategoryRules: true,
          hasTrafficEstimate: true,
          hasLiveTraffic: true,
        });
        base.confidence = conf;
      }
    } catch (_e) { /* keep heuristic traffic */ }
  }
  return base;
}

function rankPlacesForDay(places, now = new Date(), weather = null, options = {}) {
  const ranked = (places || []).map((p) => { const intel = getTravelIntelligence(p, now, weather, options); return { place: p, intel, score: intel.visitScore }; });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
// Wire itinerary after getTravelIntelligence is defined (avoid circular init issues)

module.exports = {
  getTravelIntelligence, getBatchTravelIntelligence, suggestOpenAlternatives, rankPlacesForDay,
  buildDayPlan: (places, opts = {}) => itineraryEngine.buildDayPlan(places, { ...opts, getTravelIntelligence: opts.getTravelIntelligence || getTravelIntelligence }),
  dynamicAdvice: itineraryEngine.dynamicAdvice,
  multiDayAdvice: itineraryEngine.multiDayAdvice,
  buildMultiDayItinerary,
  getTravelIntelligenceAsync,
  getActiveFestivals: festivalEngine.getActiveFestivals,
  festivalCrowdMultiplier: festivalEngine.festivalCrowdMultiplier,
  lookupHistoricalCrowd: historicalCrowdStore.lookupHistoricalCrowd,
  attachHistoricalCrowdBatch: historicalCrowdStore.attachHistoricalCrowdBatch,
  computeSunTimes, t2m, m2t, getISTParts, getSeason, getDaypart, categoryRules, predictCrowdLegacy,
};
