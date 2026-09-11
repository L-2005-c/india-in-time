'use strict';

/**
 * services/travelIntelligence/disruption/disruptionClassifier.js
 *
 * India In-Time v3.0 — Disruption Classifier & Provenance Gate
 *
 * Core Principles:
 * 1. Never infer a specific cause solely from traffic speed.
 * 2. Mandatorily separates DISRUPTION CONFIDENCE from CAUSE CONFIDENCE.
 * 3. Enforces strict Data Trust & Provenance (OBSERVED, LIVE, OFFICIAL, ESTIMATED, SIMULATED, UNKNOWN).
 * 4. Outputs structured Disruption Entity with evidence trail.
 */

const crypto = require('crypto');
const { TRAFFIC_ANOMALY_STATES } = require('./trafficAnomalyDetector');
const { correlateEventWithTraffic } = require('./eventIntelligence');

const DISRUPTION_CAUSES = Object.freeze({
  NORMAL_CONGESTION: 'NORMAL_CONGESTION',
  ACCIDENT: 'ACCIDENT',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
  PROTEST: 'PROTEST',
  RELIGIOUS_PROCESSION: 'RELIGIOUS_PROCESSION',
  SPORTS_EVENT: 'SPORTS_EVENT',
  CRICKET_MATCH: 'CRICKET_MATCH',
  FESTIVAL: 'FESTIVAL',
  CONCERT: 'CONCERT',
  POLITICAL_RALLY: 'POLITICAL_RALLY',
  VIP_MOVEMENT: 'VIP_MOVEMENT',
  POLICE_DIVERSION: 'POLICE_DIVERSION',
  FLOODING: 'FLOODING',
  CONSTRUCTION: 'CONSTRUCTION',
  EMERGENCY: 'EMERGENCY',
  UNKNOWN_DISRUPTION: 'UNKNOWN_DISRUPTION',
});

const DISRUPTION_SEVERITIES = Object.freeze({
  INFO: 'INFO',
  WATCH: 'WATCH',
  WARNING: 'WARNING',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL',
});

const DATA_STATES = Object.freeze({
  OBSERVED: 'OBSERVED',
  LIVE: 'LIVE',
  OFFICIAL: 'OFFICIAL',
  PREDICTED: 'PREDICTED',
  ESTIMATED: 'ESTIMATED',
  HISTORICAL: 'HISTORICAL',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
  UNAVAILABLE: 'UNAVAILABLE',
  SIMULATED: 'SIMULATED',
});

/**
 * Classifies traffic and multi-modal incident signals into a verified Disruption Entity.
 *
 * @param {Object} input
 * @param {string} [input.tripId] - Active trip identifier
 * @param {Object} input.trafficAnomaly - Result from detectTrafficAnomaly
 * @param {Object} [input.incidentReport] - Optional verified incident report (police, traffic advisory, emergency)
 * @param {Array<number>} [input.coords] - Current/Target coordinates [lat, lon]
 * @param {string} [input.corridorName] - Name of affected corridor
 * @param {number} [input.targetMinute] - Minute of day (0-1439)
 * @param {Array<Object>} [input.customEvents] - Injected planned events
 * @param {boolean} [input.isSimulation] - Explicit simulation flag
 * @returns {Object} Structured Disruption Entity
 */
function classifyDisruption({
  tripId = 'active_trip',
  trafficAnomaly = {},
  incidentReport = null,
  coords = null,
  corridorName = 'Transit Corridor',
  targetMinute = 720,
  customEvents = null,
  isSimulation = false,
} = {}) {
  const anomalyState = trafficAnomaly.anomalyState || TRAFFIC_ANOMALY_STATES.NORMAL_CONGESTION;
  const delayMinutes = Number(trafficAnomaly.delayMinutes || 0);

  // 1. Query Planned Event Correlation
  const eventCorrelation = correlateEventWithTraffic({
    trafficAnomaly,
    coords,
    corridorName,
    targetMinute,
    customEvents,
  });

  // 2. Determine Cause and Confidences
  let cause = DISRUPTION_CAUSES.NORMAL_CONGESTION;
  let disruptionConfidence = 'LOW';
  let causeConfidence = 'LOW';
  let source = 'TRAFFIC_BASE';
  let dataState = isSimulation ? DATA_STATES.SIMULATED : DATA_STATES.ESTIMATED;
  const evidence = [];

  // Check verified incident report first (e.g. accident, road closure, official police advisory)
  if (incidentReport && incidentReport.verified === true) {
    source = incidentReport.source || 'OFFICIAL_POLICE_ADVISORY';
    dataState = isSimulation ? DATA_STATES.SIMULATED : DATA_STATES.OFFICIAL;
    evidence.push(`Official advisory: ${incidentReport.description || incidentReport.type}`);

    const incType = String(incidentReport.type || '').toUpperCase();
    if (incType.includes('ACCIDENT')) cause = DISRUPTION_CAUSES.ACCIDENT;
    else if (incType.includes('CLOSURE') || incType.includes('BLOCKED')) cause = DISRUPTION_CAUSES.ROAD_CLOSURE;
    else if (incType.includes('DIVERSION')) cause = DISRUPTION_CAUSES.POLICE_DIVERSION;
    else if (incType.includes('PROTEST')) cause = DISRUPTION_CAUSES.PROTEST;
    else if (incType.includes('FLOOD')) cause = DISRUPTION_CAUSES.FLOODING;
    else if (incType.includes('EMERGENCY')) cause = DISRUPTION_CAUSES.EMERGENCY;
    else cause = DISRUPTION_CAUSES.ROAD_CLOSURE;

    causeConfidence = 'HIGH';
    disruptionConfidence = trafficAnomaly.isDisruption ? 'HIGH' : 'MEDIUM';
  } else if (eventCorrelation.hasCorrelatedEvent) {
    // Planned event correlated
    const evt = eventCorrelation.event;
    source = evt.source || 'EVENT_CALENDAR';
    dataState = isSimulation ? DATA_STATES.SIMULATED : (eventCorrelation.dataState || DATA_STATES.PREDICTED);
    evidence.push(eventCorrelation.explanation);

    const evtType = String(evt.eventType || '').toUpperCase();
    if (evtType.includes('CRICKET')) cause = DISRUPTION_CAUSES.CRICKET_MATCH;
    else if (evtType.includes('SPORTS')) cause = DISRUPTION_CAUSES.SPORTS_EVENT;
    else if (evtType.includes('RELIGIOUS') || evtType.includes('PROCESSION')) cause = DISRUPTION_CAUSES.RELIGIOUS_PROCESSION;
    else if (evtType.includes('TEMPLE') || evtType.includes('FESTIVAL')) cause = DISRUPTION_CAUSES.TEMPLE_EVENT;
    else if (evtType.includes('CONCERT')) cause = DISRUPTION_CAUSES.CONCERT;
    else if (evtType.includes('RALLY')) cause = DISRUPTION_CAUSES.POLITICAL_RALLY;
    else if (evtType.includes('VIP')) cause = DISRUPTION_CAUSES.VIP_MOVEMENT;
    else cause = DISRUPTION_CAUSES.UNKNOWN_DISRUPTION;

    causeConfidence = eventCorrelation.causeConfidence || 'HIGH';
    disruptionConfidence = eventCorrelation.disruptionConfidence || 'HIGH';
  } else if (trafficAnomaly.isDisruption) {
    // Severe traffic anomaly or collapse, BUT NO verified incident or event exists!
    // RULE: NEVER invent a cause solely from traffic speed!
    cause = DISRUPTION_CAUSES.UNKNOWN_DISRUPTION;
    source = 'LIVE_SPEED_TELEMETRY';
    dataState = isSimulation ? DATA_STATES.SIMULATED : DATA_STATES.LIVE;
    disruptionConfidence = 'HIGH';
    causeConfidence = 'LOW';
    evidence.push(`Observed travel delay (+${delayMinutes}m) exceeds baseline by ${trafficAnomaly.delayRatio}x with no verified event explanation.`);
  } else if (anomalyState === TRAFFIC_ANOMALY_STATES.ELEVATED_CONGESTION) {
    cause = DISRUPTION_CAUSES.NORMAL_CONGESTION;
    disruptionConfidence = 'MEDIUM';
    causeConfidence = 'MEDIUM';
    evidence.push('Moderate recurrent urban traffic delay.');
  } else {
    cause = DISRUPTION_CAUSES.NORMAL_CONGESTION;
    disruptionConfidence = 'LOW';
    causeConfidence = 'HIGH';
    evidence.push('Corridor traffic flow is within historical baseline.');
  }

  // 3. Determine Overall Severity
  let severity = DISRUPTION_SEVERITIES.INFO;
  if (cause === DISRUPTION_CAUSES.ROAD_CLOSURE || cause === DISRUPTION_CAUSES.EMERGENCY || trafficAnomaly.anomalyState === TRAFFIC_ANOMALY_STATES.ROAD_BLOCKED) {
    severity = DISRUPTION_SEVERITIES.CRITICAL;
  } else if (delayMinutes >= 50 || trafficAnomaly.anomalyState === TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION) {
    severity = DISRUPTION_SEVERITIES.SEVERE;
  } else if (delayMinutes >= 20 || trafficAnomaly.anomalyState === TRAFFIC_ANOMALY_STATES.TRAFFIC_ANOMALY) {
    severity = DISRUPTION_SEVERITIES.WARNING;
  } else if (delayMinutes >= 10 || trafficAnomaly.anomalyState === TRAFFIC_ANOMALY_STATES.ELEVATED_CONGESTION || eventCorrelation.correlationType === 'UPCOMING_EVENT_RISK') {
    severity = DISRUPTION_SEVERITIES.WATCH;
  }

  const disruptionId = `dsr_${crypto.randomBytes(6).toString('hex')}`;
  const nowIso = new Date().toISOString();

  // Delay range estimation (+/- 15%)
  const minDelay = Math.max(0, Math.round(delayMinutes * 0.85));
  const maxDelay = Math.max(minDelay + 5, Math.round(delayMinutes * 1.25));
  const delayRange = `${minDelay}–${maxDelay} min`;

  return {
    disruptionId,
    tripId,
    eventType: cause,
    severity,
    location: coords ? { lat: coords[0], lon: coords[1] } : null,
    corridor: corridorName,
    detectedAt: nowIso,
    startedAt: nowIso,
    expectedEnd: null,
    resolvedAt: null,
    source,
    dataState,
    confidence: disruptionConfidence, // Alias for backward compatibility
    disruptionConfidence,
    causeConfidence,
    isCauseVerified: causeConfidence === 'HIGH' && cause !== DISRUPTION_CAUSES.UNKNOWN_DISRUPTION,
    evidence,
    affectedRoute: corridorName,
    affectedStops: [],
    estimatedDelay: delayMinutes,
    delayRange,
    journeyImpact: null, // Computed downstream by JourneyImpactEngine
    currentStatus: severity === DISRUPTION_SEVERITIES.INFO ? 'NORMAL' : 'ACTIVE',
  };
}

module.exports = {
  DISRUPTION_CAUSES,
  DISRUPTION_SEVERITIES,
  DATA_STATES,
  classifyDisruption,
};
