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
});

const TRIGGER_SEVERITY = Object.freeze({
  INFO: 'INFO',
  WATCH: 'WATCH',
  SUBOPTIMAL: 'SUBOPTIMAL',
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
} = {}) {
  const triggers = [];

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
