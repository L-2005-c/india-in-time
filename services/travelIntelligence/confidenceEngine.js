// confidenceEngine.js
const rules = require('../../data/time-intelligence-rules.json');
function computeConfidence(flags = {}) {
  const cfg = rules.confidence || { base: 55, hasWeather: 12, hasCoords: 8, hasOpeningHours: 10, hasCategoryRules: 8, hasTrafficEstimate: 5, hasHistoricalHint: 5, max: 95 };
  let score = cfg.base ?? 55;
  const sources = [];
  if (flags.hasWeather) { score += cfg.hasWeather ?? 12; sources.push('weather'); }
  if (flags.hasCoords) { score += cfg.hasCoords ?? 8; sources.push('coordinates'); }
  if (flags.hasOpeningHours) { score += cfg.hasOpeningHours ?? 10; sources.push('openingHours'); }
  if (flags.hasCategoryRules) { score += cfg.hasCategoryRules ?? 8; sources.push('categoryRules'); }
  if (flags.hasTrafficEstimate) { score += cfg.hasTrafficEstimate ?? 5; sources.push('trafficHeuristic'); }
  if (flags.hasHistoricalHint) { score += cfg.hasHistoricalHint ?? 5; sources.push('historical'); }
  if (flags.hasLiveTraffic) { score += 10; sources.push('liveTraffic'); }
  score = Math.max(15, Math.min(cfg.max ?? 95, Math.round(score)));
  const level = score >= 80 ? 'High' : score >= 60 ? 'Medium' : score >= 40 ? 'Low' : 'Very Low';
  const confidenceReasons = [];
  if (!flags.hasWeather) confidenceReasons.push('weather unavailable');
  if (!flags.hasCoords) confidenceReasons.push('coordinates unavailable');
  if (!flags.hasOpeningHours) confidenceReasons.push('opening hours not verified');
  if (!flags.hasHistoricalHint) confidenceReasons.push('limited historical crowd observations');
  if (!flags.hasLiveTraffic) confidenceReasons.push('live traffic unavailable');
  return {
    confidenceScore: score,
    confidence: score,
    confidenceLevel: level,
    level,
    confidenceReasons,
    sources,
    dataSources: sources,
    dataFreshness: flags.dataFreshness || null,
    note: score >= 80 ? 'Most key signals available' : score >= 60 ? 'Core signals present; some estimates used' : 'Limited data — recommendation relies more on rules',
  };
}
module.exports = { computeConfidence };
