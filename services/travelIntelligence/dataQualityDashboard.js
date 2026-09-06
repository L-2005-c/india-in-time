'use strict';

/**
 * services/travelIntelligence/dataQualityDashboard.js
 *
 * Internal Engineering Diagnostics & Runtime Data Quality Dashboard.
 * Tracks actual telemetry without fabricating percentages.
 */

const metrics = {
  poi: { total: 0, autoValidated: 0, providerVerified: 0, humanVerified: 0, quarantined: 0, rejected: 0, unverified: 0 },
  routing: { total: 0, liveTraffic: 0, roadNetwork: 0, heuristicFallback: 0 },
  weather: { total: 0, available: 0, unavailable: 0, stale: 0 },
  traffic: { total: 0, available: 0, unavailable: 0 },
  crowd: { total: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, unknownConfidence: 0 },
  ai: { total: 0, success: 0, fallbackUsed: 0 },
};

function recordPoiTelemetry({ verificationStatus }) {
  metrics.poi.total++;
  const status = String(verificationStatus || 'UNVERIFIED').toUpperCase();
  if (status === 'AUTO_VALIDATED') metrics.poi.autoValidated++;
  else if (status === 'PROVIDER_VERIFIED') metrics.poi.providerVerified++;
  else if (status === 'HUMAN_VERIFIED') metrics.poi.humanVerified++;
  else if (status === 'QUARANTINED') metrics.poi.quarantined++;
  else if (status === 'REJECTED') metrics.poi.rejected++;
  else metrics.poi.unverified++;
}

function recordRoutingTelemetry({ routeType, fallback }) {
  metrics.routing.total++;
  if (fallback || routeType === 'GEODESIC_HEURISTIC_ESTIMATE') {
    metrics.routing.heuristicFallback++;
  } else if (routeType === 'LIVE_TRAFFIC_ROUTE') {
    metrics.routing.liveTraffic++;
  } else {
    metrics.routing.roadNetwork++;
  }
}

function recordWeatherTelemetry({ isAvailable, isStale = false }) {
  metrics.weather.total++;
  if (isAvailable) metrics.weather.available++;
  else metrics.weather.unavailable++;
  if (isStale) metrics.weather.stale++;
}

function recordTrafficTelemetry({ isAvailable }) {
  metrics.traffic.total++;
  if (isAvailable) metrics.traffic.available++;
  else metrics.traffic.unavailable++;
}

function recordCrowdTelemetry({ confidence }) {
  metrics.crowd.total++;
  const conf = String(confidence || '').toUpperCase();
  if (conf === 'HIGH') metrics.crowd.highConfidence++;
  else if (conf === 'MEDIUM') metrics.crowd.mediumConfidence++;
  else if (conf === 'LOW') metrics.crowd.lowConfidence++;
  else metrics.crowd.unknownConfidence++;
}

function recordAiTelemetry({ success, usedFallback = false }) {
  metrics.ai.total++;
  if (success) metrics.ai.success++;
  if (usedFallback) metrics.ai.fallbackUsed++;
}

/**
 * Calculates current runtime quality metrics.
 * Grounded strictly in recorded telemetry.
 */
function getRuntimeDataQualityMetrics() {
  const poiTotal = metrics.poi.total;
  const verifiedPoi = metrics.poi.autoValidated + metrics.poi.providerVerified + metrics.poi.humanVerified;
  const routeTotal = metrics.routing.total;
  const weatherTotal = metrics.weather.total;
  const trafficTotal = metrics.traffic.total;
  const aiTotal = metrics.ai.total;
  const crowdTotal = metrics.crowd.total;

  return {
    sampleCounts: {
      poi: poiTotal,
      routes: routeTotal,
      weather: weatherTotal,
      traffic: trafficTotal,
      crowd: crowdTotal,
      ai: aiTotal,
    },
    poiVerificationRate: poiTotal > 0 ? Math.round((verifiedPoi / poiTotal) * 100) / 100 : null,
    poiQuarantineRate: poiTotal > 0 ? Math.round((metrics.poi.quarantined / poiTotal) * 100) / 100 : null,
    poiRejectionRate: poiTotal > 0 ? Math.round((metrics.poi.rejected / poiTotal) * 100) / 100 : null,
    routeFallbackRate: routeTotal > 0 ? Math.round((metrics.routing.heuristicFallback / routeTotal) * 100) / 100 : null,
    weatherAvailability: weatherTotal > 0 ? Math.round((metrics.weather.available / weatherTotal) * 100) / 100 : null,
    trafficAvailability: trafficTotal > 0 ? Math.round((metrics.traffic.available / trafficTotal) * 100) / 100 : null,
    aiFallbackRate: aiTotal > 0 ? Math.round((metrics.ai.fallbackUsed / aiTotal) * 100) / 100 : null,
    crowdConfidenceDistribution: {
      HIGH: crowdTotal > 0 ? Math.round((metrics.crowd.highConfidence / crowdTotal) * 100) / 100 : null,
      MEDIUM: crowdTotal > 0 ? Math.round((metrics.crowd.mediumConfidence / crowdTotal) * 100) / 100 : null,
      LOW: crowdTotal > 0 ? Math.round((metrics.crowd.lowConfidence / crowdTotal) * 100) / 100 : null,
      UNKNOWN: crowdTotal > 0 ? Math.round((metrics.crowd.unknownConfidence / crowdTotal) * 100) / 100 : null,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  recordPoiTelemetry,
  recordRoutingTelemetry,
  recordWeatherTelemetry,
  recordTrafficTelemetry,
  recordCrowdTelemetry,
  recordAiTelemetry,
  getRuntimeDataQualityMetrics,
};
