'use strict';

/**
 * services/travelIntelligence/guardian/triggerFramework.js
 *
 * Standardized Event Trigger Framework for India In-Time v3.0 Travel Guardian.
 * Defines 12 disruption triggers with anti-churn hysteresis and severity levels.
 */

const TRIGGER_TYPES = Object.freeze({
  WEATHER_DETERIORATION: 'WEATHER_DETERIORATION',
  GHAT_ROAD_RISK: 'GHAT_ROAD_RISK',
  HEAT_SURGE: 'HEAT_SURGE',
  FOG_HAZARD: 'FOG_HAZARD',
  CROWD_SURGE: 'CROWD_SURGE',
  TRAFFIC_DELAY: 'TRAFFIC_DELAY',
  TRAVELER_DELAY: 'TRAVELER_DELAY',
  OPENING_HOURS_CONFLICT: 'OPENING_HOURS_CONFLICT',
  SCENIC_WINDOW_MISSED: 'SCENIC_WINDOW_MISSED',
  DESTINATION_CLOSURE: 'DESTINATION_CLOSURE',
  HAZARD_CHANGE: 'HAZARD_CHANGE',
  EMERGENCY: 'EMERGENCY',
  // Phase 2 Disruption Triggers
  TRAFFIC_ANOMALY: 'TRAFFIC_ANOMALY',
  MAJOR_TRAFFIC_DISRUPTION: 'MAJOR_TRAFFIC_DISRUPTION',
  PLANNED_EVENT_RISK: 'PLANNED_EVENT_RISK',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
  INCIDENT_REPORTED: 'INCIDENT_REPORTED',
  EVENT_CORRIDOR_OVERLAP: 'EVENT_CORRIDOR_OVERLAP',
  TRAFFIC_RECOVERY: 'TRAFFIC_RECOVERY',
  DISRUPTION_RESOLVED: 'DISRUPTION_RESOLVED',
  // Phase 3 Safety & Risk Intelligence Triggers
  SAFETY_OFFICIAL_WARNING: 'SAFETY_OFFICIAL_WARNING',
  SAFETY_HAZARD_DETECTED: 'SAFETY_HAZARD_DETECTED',
  SAFETY_ROUTE_EXPOSURE: 'SAFETY_ROUTE_EXPOSURE',
  SAFETY_ESCALATION: 'SAFETY_ESCALATION',
  SAFETY_RESOLUTION: 'SAFETY_RESOLUTION',
  GHAT_WEATHER_RISK: 'GHAT_WEATHER_RISK',
  FLOOD_EXPOSURE: 'FLOOD_EXPOSURE',
  FIRE_EXPOSURE: 'FIRE_EXPOSURE',
  LIGHTNING_EXPOSURE: 'LIGHTNING_EXPOSURE',
  LANDSLIDE_EXPOSURE: 'LANDSLIDE_EXPOSURE',
  EXTREME_HEAT_EXPOSURE: 'EXTREME_HEAT_EXPOSURE',
  LOW_VISIBILITY_EXPOSURE: 'LOW_VISIBILITY_EXPOSURE',
  SAFETY_DATA_STALE: 'SAFETY_DATA_STALE',
  SAFETY_DATA_CONFLICT: 'SAFETY_DATA_CONFLICT',
  SAFETY_PROVIDER_FAILURE: 'SAFETY_PROVIDER_FAILURE',
});

const TRIGGER_SEVERITY = Object.freeze({
  INFO: 'INFO',
  WATCH: 'WATCH',
  CAUTION: 'CAUTION',
  SUBOPTIMAL: 'SUBOPTIMAL',
  WARNING: 'WARNING',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL',
});

/**
 * Evaluates triggers across upcoming stops, weather, traffic, and traveler DNA.
 */
function evaluateTriggers({
  journeyState,
  upcomingStops = [],
  weatherTelemetry = {},
  trafficTelemetry = {},
  travelerDna = {},
  safetyTelemetry = {},
} = {}) {
  const triggers = [];

  // 0. Phase 3: Safety & Risk Intelligence Triggers
  const safetySignals = Array.isArray(safetyTelemetry.signals)
    ? safetyTelemetry.signals
    : (Array.isArray(safetyTelemetry.activeSignals) ? safetyTelemetry.activeSignals : []);

  for (const sig of safetySignals) {
    const isHardClosure = sig.hazardType === 'ROAD_CLOSURE' || sig.hazardType === 'EVACUATION_ALERT';
    const sev = isHardClosure || sig.severity === 'CRITICAL' ? TRIGGER_SEVERITY.CRITICAL
      : (sig.severity === 'SEVERE' || sig.severity === 'WARNING' ? TRIGGER_SEVERITY.WARNING
      : (sig.severity === 'CAUTION' ? TRIGGER_SEVERITY.CAUTION : TRIGGER_SEVERITY.WATCH));

    if (sig.isStale) {
      triggers.push({
        type: TRIGGER_TYPES.SAFETY_DATA_STALE,
        severity: TRIGGER_SEVERITY.WATCH,
        message: `Current safety information could not be refreshed. Previous warning for ${sig.hazardType} was last confirmed ${sig.ageMinutes || 'some'} minutes ago.`,
        signalId: sig.id,
      });
    } else if (sig.sourceConflict) {
      triggers.push({
        type: TRIGGER_TYPES.SAFETY_DATA_CONFLICT,
        severity: TRIGGER_SEVERITY.WATCH,
        message: `Sources disagree on ${sig.hazardType}: Official warning remains active; model forecast differs.`,
        signalId: sig.id,
      });
    } else if (sig.dataState === 'OFFICIAL_WARNING') {
      triggers.push({
        type: TRIGGER_TYPES.SAFETY_OFFICIAL_WARNING,
        severity: sev,
        message: `Official Government Warning: ${sig.hazardType} active for ${sig.location?.name || 'route area'}.`,
        hazardType: sig.hazardType,
        signalId: sig.id,
      });
    } else {
      triggers.push({
        type: TRIGGER_TYPES.SAFETY_HAZARD_DETECTED,
        severity: sev,
        message: `Safety hazard detected: ${sig.hazardType} (${sig.severity || 'CAUTION'}).`,
        hazardType: sig.hazardType,
        signalId: sig.id,
      });
    }
  }

  const rainTolerance = travelerDna.rainTolerance ?? 40;
  const heatTolerance = travelerDna.heatTolerance ?? 50;

  // 1. Traveler Delay / Pacing Lag Trigger
  const lag = journeyState?.pacingLagMinutes || 0;
  if (lag >= 35) {
    triggers.push({
      type: TRIGGER_TYPES.TRAVELER_DELAY,
      severity: lag >= 60 ? TRIGGER_SEVERITY.CRITICAL : TRIGGER_SEVERITY.SUBOPTIMAL,
      message: `Accumulated delay of ${lag} minutes is compressing remaining itinerary.`,
      delayMinutes: lag,
      affectedStops: upcomingStops.map(s => s.name),
    });
  }

  // 2. Traffic Corridor Delays
  const trafficDelay = trafficTelemetry.trafficDelayMinutes || 0;
  if (trafficDelay >= 25) {
    triggers.push({
      type: TRIGGER_TYPES.TRAFFIC_DELAY,
      severity: trafficDelay >= 45 ? TRIGGER_SEVERITY.CRITICAL : TRIGGER_SEVERITY.SUBOPTIMAL,
      message: `Severe traffic congestion adding ${trafficDelay} minutes to transit.`,
      corridor: trafficTelemetry.corridorName || 'Transit Corridor',
    });
  }

  // 2b. Phase 2 Disruption Intelligence Triggers
  const disruption = trafficTelemetry.disruption || trafficTelemetry.disruptionTelemetry || null;
  const isRoadClosure = trafficTelemetry.isRoadBlocked || disruption?.eventType === 'ROAD_CLOSURE' || disruption?.eventType === 'EMERGENCY';
  if (isRoadClosure) {
    triggers.push({
      type: TRIGGER_TYPES.ROAD_CLOSURE,
      severity: TRIGGER_SEVERITY.CRITICAL,
      message: `Route blockage / confirmed road closure along ${trafficTelemetry.corridorName || disruption?.corridor || 'corridor'}.`,
      corridor: trafficTelemetry.corridorName || disruption?.corridor || 'Transit Corridor',
      evidence: disruption?.evidence || ['Verified road closure or zero speed corridor'],
    });
  } else if (disruption && (disruption.severity === 'SEVERE' || disruption.eventType === 'MAJOR_DISRUPTION' || trafficDelay >= 50)) {
    triggers.push({
      type: TRIGGER_TYPES.MAJOR_TRAFFIC_DISRUPTION,
      severity: TRIGGER_SEVERITY.CRITICAL,
      message: `Major traffic collapse adding +${disruption.estimatedDelay || trafficDelay} minutes to transit. Cause: ${disruption.isCauseVerified ? disruption.eventType : 'Currently unverified'}.`,
      corridor: disruption.corridor || trafficTelemetry.corridorName || 'Transit Corridor',
      disruptionConfidence: disruption.disruptionConfidence || 'HIGH',
      causeConfidence: disruption.causeConfidence || 'LOW',
    });
  } else if (disruption && (disruption.severity === 'WARNING' || disruption.eventType === 'TRAFFIC_ANOMALY')) {
    triggers.push({
      type: TRIGGER_TYPES.TRAFFIC_ANOMALY,
      severity: TRIGGER_SEVERITY.SUBOPTIMAL,
      message: `Abnormal traffic surge detected along ${disruption.corridor || 'route'} (+${disruption.estimatedDelay || trafficDelay}m).`,
      corridor: disruption.corridor || trafficTelemetry.corridorName || 'Transit Corridor',
    });
  }

  // Planned Event Corridor Overlap & Risk
  const plannedEvent = trafficTelemetry.plannedEvent || disruption?.event || null;
  if (plannedEvent || disruption?.eventType === 'PLANNED_EVENT_RISK' || disruption?.correlationType === 'UPCOMING_EVENT_RISK') {
    const evtName = plannedEvent?.name || disruption?.evidence?.[0] || 'Scheduled public gathering';
    triggers.push({
      type: TRIGGER_TYPES.PLANNED_EVENT_RISK,
      severity: TRIGGER_SEVERITY.WATCH,
      message: `Upcoming event corridor overlap: ${evtName}. Expected impact +${plannedEvent?.expectedDelayMinutes || 45}m.`,
      corridor: trafficTelemetry.corridorName || disruption?.corridor || 'Event Corridor',
    });
  }

  // Incident reported
  if (trafficTelemetry.incidentReport && trafficTelemetry.incidentReport.verified) {
    triggers.push({
      type: TRIGGER_TYPES.INCIDENT_REPORTED,
      severity: TRIGGER_SEVERITY.SUBOPTIMAL,
      message: `Official traffic police advisory: ${trafficTelemetry.incidentReport.description || trafficTelemetry.incidentReport.type}.`,
      corridor: trafficTelemetry.corridorName || 'Corridor',
    });
  }

  // Traffic recovery
  if (trafficTelemetry.isRecovering || disruption?.recoveryTrend === 'IMPROVING') {
    triggers.push({
      type: TRIGGER_TYPES.TRAFFIC_RECOVERY,
      severity: TRIGGER_SEVERITY.INFO,
      message: 'Traffic flow is recovering back toward normal corridor baseline.',
      corridor: trafficTelemetry.corridorName || 'Corridor',
    });
  }

  // 3. Ghat Road / Highland Rain & Landslide Risk
  const isGhatCorridor = trafficTelemetry.isGhatCorridor ||
    upcomingStops.some(s => /ghat|araku|valley|hill|pass/i.test(s.name) || (s.elevationM && s.elevationM > 600));
  const currentRainProb = weatherTelemetry.precipitationProb ?? 0;
  const isHeavyRain = currentRainProb >= 65 || /heavy|storm|downpour/i.test(weatherTelemetry.condition || '');

  if (isGhatCorridor && isHeavyRain) {
    triggers.push({
      type: TRIGGER_TYPES.GHAT_ROAD_RISK,
      severity: TRIGGER_SEVERITY.CRITICAL,
      message: `Active heavy rain / landslide risk along Ghat Road corridor (${currentRainProb}% rain).`,
      corridor: 'Ghat Section',
      safetyGuidance: 'Reduce mountain road driving; prefer daylight transit and covered stops.',
    });
  }

  // 3b. Weather Uncertainty & Telemetry Failure Trigger
  const isWeatherUnavailable = weatherTelemetry.dataState === 'UNAVAILABLE' || weatherTelemetry.isAvailable === false;
  const isWeatherEstimatedLowConfidence = (weatherTelemetry.isEstimated || weatherTelemetry.dataState === 'ESTIMATED') && weatherTelemetry.confidence === 'LOW';
  const hasWeatherDisagreement = Boolean(weatherTelemetry.disagreementNotice);

  if (isWeatherUnavailable) {
    triggers.push({
      type: TRIGGER_TYPES.WEATHER_DETERIORATION,
      severity: TRIGGER_SEVERITY.WATCH,
      message: 'Live meteorological telemetry is currently unavailable; plan with conservative outdoor buffers.',
    });
  } else if (hasWeatherDisagreement) {
    triggers.push({
      type: TRIGGER_TYPES.WEATHER_DETERIORATION,
      severity: TRIGGER_SEVERITY.WATCH,
      message: `Weather uncertainty detected: ${weatherTelemetry.disagreementNotice}`,
    });
  } else if (isWeatherEstimatedLowConfidence && upcomingStops.some(s => s.category === 'nature' || s.category === 'viewpoint' || s.category === 'beach')) {
    triggers.push({
      type: TRIGGER_TYPES.WEATHER_DETERIORATION,
      severity: TRIGGER_SEVERITY.INFO,
      message: 'Weather based on diurnal model estimate; monitor actual sky conditions before remote outdoor activities.',
    });
  }

  // 4. Stop-Specific Conditions (Weather, Opening Hours, Scenic)
  for (const stop of upcomingStops) {
    const isOutdoor = stop.category === 'nature' || stop.category === 'viewpoint' || stop.category === 'beach' || stop.category === 'cave';

    // Weather deterioration for outdoor stops
    if (isOutdoor && currentRainProb > rainTolerance && currentRainProb >= 50) {
      triggers.push({
        type: TRIGGER_TYPES.WEATHER_DETERIORATION,
        severity: currentRainProb >= 75 ? TRIGGER_SEVERITY.CRITICAL : TRIGGER_SEVERITY.SUBOPTIMAL,
        message: `High rain chance (${currentRainProb}%) impairs outdoor experience at ${stop.name}.`,
        stopId: stop.id,
        stopName: stop.name,
      });
    }

    // Heat surge for midday outdoor stops
    const temp = weatherTelemetry.apparentTempC ?? weatherTelemetry.temperatureC ?? 28;
    if (isOutdoor && temp >= 37 && heatTolerance < 60) {
      triggers.push({
        type: TRIGGER_TYPES.HEAT_SURGE,
        severity: TRIGGER_SEVERITY.SUBOPTIMAL,
        message: `High apparent temperature (${temp}°C) exceeds heat comfort threshold at ${stop.name}.`,
        stopId: stop.id,
        stopName: stop.name,
      });
    }

    // Opening Hours Conflict
    if (stop.openingHours && stop.projectedArrivalMinute) {
      const closeMin = parseTimeToMinutes(stop.openingHours.close);
      if (closeMin !== null) {
        if (stop.projectedArrivalMinute >= closeMin) {
          triggers.push({
            type: TRIGGER_TYPES.OPENING_HOURS_CONFLICT,
            severity: TRIGGER_SEVERITY.CRITICAL,
            message: `${stop.name} will be closed upon projected arrival (${formatMinutesToTime(stop.projectedArrivalMinute)} vs closing ${stop.openingHours.close}).`,
            stopId: stop.id,
            stopName: stop.name,
          });
        } else if (closeMin - stop.projectedArrivalMinute < 25) {
          triggers.push({
            type: TRIGGER_TYPES.OPENING_HOURS_CONFLICT,
            severity: TRIGGER_SEVERITY.WATCH,
            message: `Arrival at ${stop.name} leaves less than 25 minutes before closing time.`,
            stopId: stop.id,
            stopName: stop.name,
          });
        }
      }
    }
  }

  return triggers;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatMinutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  TRIGGER_TYPES,
  TRIGGER_SEVERITY,
  evaluateTriggers,
};
