// GeoAI Time Intelligence Engine — facade over Travel Intelligence
const rules = require('../data/time-intelligence-rules.json');
const travelIntel = require('./travelIntelligence');
const { getTravelIntelligence, getBatchTravelIntelligence, suggestOpenAlternatives: tiSuggest, computeSunTimes: tiComputeSunTimes, t2m, m2t, predictCrowdLegacy } = travelIntel;
function computeSunTimes(lat, lon, date) {
  const full = tiComputeSunTimes(lat, lon, date);
  return { sunrise: full.sunrise, sunset: full.sunset };
}
const TRIP_MODES = ['solo', 'duo', 'trio', 'family', 'group'];
function getPlaceState(place, now = new Date(), weather = null) {
  const intel = getTravelIntelligence(place, now, weather, {});
  return {
    name: intel.name, category: intel.category, isOpenNow: intel.isOpenNow, statusLabel: intel.statusLabel,
    minutesToClose: intel.minutesToClose, minutesToOpen: intel.minutesToOpen, openTime: intel.openTime, closeTime: intel.closeTime,
    sunrise: intel.sunrise, sunset: intel.sunset, nightAvailable: intel.nightAvailable, weeklyHoliday: intel.weeklyHoliday,
    daypart: intel.daypart, isBestTimeNow: intel.isBestTimeNow, isPeakHourNow: intel.isPeakHourNow, crowdLevel: intel.crowdLevel,
    season: intel.season, bestSeason: intel.bestSeason, seasonalNote: intel.seasonalNote, recommendations: intel.recommendations,
    weatherWarnings: intel.weatherWarnings, badges: intel.badges, notifications: intel.notifications,
    visitScore: intel.visitScore, visitLabel: intel.visitLabel, scoringProfile: intel.scoringProfile, components: intel.components,
    crowd: intel.crowd, weather: intel.weather, traffic: intel.traffic, scenic: intel.scenic, arrival: intel.arrival,
    confidence: intel.confidence, explanation: intel.explanation, goldenHours: intel.goldenHours, inGoldenHour: intel.inGoldenHour,
    dataQuality: intel.dataQuality, computedAt: intel.computedAt,
  };
}
function getBatchState(places, now = new Date(), weather = null) {
  return (places || []).map((p) => getPlaceState(p, now, weather));
}
function predictCrowd({ daypart, isWeekend, isPeakHourNow, cat }) {
  return predictCrowdLegacy({ daypart, isWeekend, isPeakHourNow, cat });
}
function applyWeightSet(score, place, weights) {
  for (const [key, mult] of Object.entries(weights)) {
    if (key === 'sunrise' && place.is_sunrise_spot) score *= mult;
    else if (key === 'sunset' && place.is_sunset_spot) score *= mult;
    else if (key === 'nightlife' && place.has_nightlife) score *= mult;
    else if (key === 'safety' && place.family_friendly) score *= mult;
    else if (key === place.cat) score *= mult;
  }
  return score;
}
function personalizeScore(baseScore, place, personas = [], tripMode = null) {
  let score = baseScore;
  for (const persona of personas) {
    const weights = rules.personas[persona];
    if (weights) score = applyWeightSet(score, place, weights);
  }
  if (tripMode && TRIP_MODES.includes(tripMode) && rules.tripModes) {
    const weights = rules.tripModes[tripMode];
    if (weights) score = applyWeightSet(score, place, weights);
  }
  return score;
}
function suggestOpenAlternatives(closedPlace, allPlaces, now = new Date(), weather = null, limit = 3) {
  return tiSuggest(closedPlace, allPlaces, now, weather, limit);
}
module.exports = { getPlaceState, getBatchState, predictCrowd, personalizeScore, computeSunTimes, suggestOpenAlternatives, t2m, m2t, TRIP_MODES, getTravelIntelligence, getBatchTravelIntelligence };
