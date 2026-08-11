// scoringEngine.js
const rules = require('../../data/time-intelligence-rules.json');
const { categoryRules } = require('./openingHoursEngine');
function getWeights(place) {
  const catRule = categoryRules(place.cat || 'default');
  const profileName = catRule.scoringProfile || 'default';
  const profiles = rules.scoringWeights?.profiles || {};
  const weights = profiles[profileName] || rules.scoringWeights?.default || { weather: 0.18, crowd: 0.20, traffic: 0.12, scenic: 0.18, time: 0.12, opening: 0.12, preferences: 0.08 };
  return { weights, profileName };
}
function bandLabel(score) {
  const bands = rules.visitScoreBands || {};
  for (const [name, range] of Object.entries(bands)) {
    if (score >= range[0] && score <= range[1]) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (score >= 90) return 'Exceptional'; if (score >= 75) return 'Excellent'; if (score >= 60) return 'Good'; if (score >= 40) return 'Fair'; return 'Poor';
}
function computeVisitScore(components = {}, place = {}) {
  const { weights, profileName } = getWeights(place);
  const { weatherScore = 50, crowdScore = 50, trafficScore = 50, scenicScore = 40, timeScore = 50, openingScore = 50, preferenceScore = 50 } = components;
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const w = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / sum]));
  let raw = (w.weather || 0) * weatherScore + (w.crowd || 0) * crowdScore + (w.traffic || 0) * trafficScore + (w.scenic || 0) * scenicScore + (w.time || 0) * timeScore + (w.opening || 0) * openingScore + (w.preferences || 0) * preferenceScore;
  if (openingScore <= 5) raw = Math.min(raw, 15);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { visitScore: score, label: bandLabel(score), profile: profileName, weights: w, components: { weather: Math.round(weatherScore), crowd: Math.round(crowdScore), traffic: Math.round(trafficScore), scenic: Math.round(scenicScore), time: Math.round(timeScore), opening: Math.round(openingScore), preferences: Math.round(preferenceScore) } };
}
function computeTimeScore(place, ctx = {}) {
  const { nowMin, isBestTimeNow = false, isPeakHourNow = false, daypart, goldenIn = false } = ctx;
  let score = 50;
  if (isBestTimeNow) score += 30; else if (goldenIn) score += 20;
  else if (daypart === 'earlyMorning' || daypart === 'evening') score += 10;
  else if (daypart === 'afternoon') score -= 5; else if (daypart === 'night') score -= 10;
  if (isPeakHourNow) score -= 8;
  if (place.cat === 'food' && nowMin != null) {
    if ((nowMin >= 12 * 60 && nowMin <= 15 * 60) || (nowMin >= 19 * 60 && nowMin <= 22 * 60)) score += 15;
  }
  return Math.max(0, Math.min(100, score));
}
function openingToScore(opening) {
  if (!opening || opening.status === 'UNKNOWN') return 40;
  if (opening.status === 'OPEN') return 90;
  if (opening.status === 'CLOSING_SOON') return 55;
  if (opening.status === 'OPENS_SOON') return 35;
  return 5;
}
function trafficToScore(traffic) {
  if (!traffic) return 50;
  if (traffic.source === 'unavailable' || traffic.trafficLevel === 'Unknown') return 45;
  if (traffic.trafficLevel === 'Low') return 90;
  if (traffic.trafficLevel === 'Moderate') return 60;
  if (traffic.trafficLevel === 'High') return 25;
  return 50;
}
function computePreferenceScore(place, personas = [], tripMode = null) {
  let mult = 1.0;
  const personaRules = rules.personas || {}, tripRules = rules.tripModes || {};
  for (const p of personas || []) {
    const weights = personaRules[p];
    if (!weights) continue;
    for (const [key, m] of Object.entries(weights)) {
      if (key === 'sunrise' && place.is_sunrise_spot) mult *= m;
      else if (key === 'sunset' && place.is_sunset_spot) mult *= m;
      else if (key === 'nightlife' && place.has_nightlife) mult *= m;
      else if (key === 'safety' && place.family_friendly) mult *= m;
      else if (key === place.cat) mult *= m;
    }
  }
  if (tripMode && tripRules[tripMode]) {
    const weights = tripRules[tripMode];
    for (const [key, m] of Object.entries(weights)) {
      if (key === 'sunrise' && place.is_sunrise_spot) mult *= m;
      else if (key === 'sunset' && place.is_sunset_spot) mult *= m;
      else if (key === 'nightlife' && place.has_nightlife) mult *= m;
      else if (key === place.cat) mult *= m;
    }
  }
  return Math.max(0, Math.min(100, Math.round(50 + (mult - 1) * 40)));
}
module.exports = { getWeights, bandLabel, computeVisitScore, computeTimeScore, openingToScore, trafficToScore, computePreferenceScore };
