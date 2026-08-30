// Travel Intelligence Engine — orchestrator
const { t2m, m2t, getISTParts, getSeason, computeSunTimes, getDaypart } = require('./timeEngine');
const { categoryRules } = require('./openingHoursEngine');
const { predictCrowdLegacy } = require('./crowdEngine');
const { dynamicAdvice, multiDayAdvice } = require('./advisoryEngine');
const { buildMultiDayItinerary } = require('./multiDayPlanner');
const festivalEngine = require('./festivalEngine');
const historicalCrowdStore = require('./historicalCrowdStore');
const { getTravelIntelligence } = require('./decisionEngine');

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
  dynamicAdvice,
  multiDayAdvice,
  buildMultiDayItinerary,
  getTravelIntelligenceAsync,
  getActiveFestivals: festivalEngine.getActiveFestivals,
  festivalCrowdMultiplier: festivalEngine.festivalCrowdMultiplier,
  lookupHistoricalCrowd: historicalCrowdStore.lookupHistoricalCrowd,
  attachHistoricalCrowdBatch: historicalCrowdStore.attachHistoricalCrowdBatch,
  computeSunTimes, t2m, m2t, getISTParts, getSeason, getDaypart, categoryRules, predictCrowdLegacy,
};
