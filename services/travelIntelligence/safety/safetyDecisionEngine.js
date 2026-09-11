'use strict';

/**
 * services/travelIntelligence/safety/safetyDecisionEngine.js
 *
 * Evidence-Driven Safety & Risk Decision Engine for India In-Time v3.0.
 *
 * Implements 11 Interpretable Decision States:
 * CONTINUE, WATCH, CAUTION, DELAY, WAIT, REROUTE, REORDER, REPLACE_STOP, AVOID, EMERGENCY, INSUFFICIENT_DATA
 */

const SAFETY_DECISION_STATES = Object.freeze({
  CONTINUE: 'CONTINUE',
  WATCH: 'WATCH',
  CAUTION: 'CAUTION',
  DELAY: 'DELAY',
  WAIT: 'WAIT',
  REROUTE: 'REROUTE',
  REORDER: 'REORDER',
  REPLACE_STOP: 'REPLACE_STOP',
  AVOID: 'AVOID',
  EMERGENCY: 'EMERGENCY',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

/**
 * Evaluates the safety decision across dimensions.
 */
function evaluateSafetyDecision({
  signal = null,
  geospatial = {},
  temporal = {},
  exposure = {},
  travelerDna = {},
  _journeyState = {},
  _context = {},
} = {}) {
  // 1. Missing / Insufficient Data Guard
  if (!signal || signal.dataState === 'UNAVAILABLE' || (signal.confidence === 'LOW' && !signal.evidence?.length)) {
    return {
      decision: SAFETY_DECISION_STATES.INSUFFICIENT_DATA,
      confidence: 'LOW',
      planAppropriate: false,
      explanation: {
        primaryDriver: 'Safety telemetry unavailable or unverified.',
        dimensions: {
          hazardSeverity: 'UNKNOWN',
          exposureLevel: 'UNKNOWN',
          dataFreshness: 'UNAVAILABLE',
        },
        nextStep: 'Current safety evidence is insufficient to verify route condition; proceed with vigilance or refresh telemetry.',
      },
    };
  }

  // 2. Hard Safety Constraint Override (Closure, Evacuation)
  if (exposure.isHardSafetyConstraint || signal.hazardType === 'ROAD_CLOSURE' || signal.hazardType === 'EVACUATION_ALERT') {
    // If true authoritative disaster directive => EMERGENCY, else AVOID / REROUTE
    const isEmergency = signal.severity === 'CRITICAL' && signal.sourceType?.includes('DISASTER');
    const state = isEmergency ? SAFETY_DECISION_STATES.EMERGENCY : SAFETY_DECISION_STATES.AVOID;

    return {
      decision: state,
      confidence: 'HIGH',
      planAppropriate: false,
      explanation: {
        primaryDriver: `Official ${signal.hazardType} enforces immediate route closure.`,
        dimensions: {
          hazardSeverity: signal.severity,
          hazardConfidence: signal.hazardConfidence || signal.confidence || 'HIGH',
          causeConfidence: signal.causeConfidence || 'HIGH',
          impactConfidence: 'HIGH',
          exposureLevel: geospatial.exposureLevel || 'DIRECT_INTERSECTION',
          temporalOverlap: temporal.state || 'TEMPORAL_OVERLAP',
          isHardConstraint: true,
        },
        nextStep: 'Halt approach toward affected corridor; follow official diversion or execute proactive reroute.',
      },
    };
  }

  // 3. Stale Data Notice Guard
  if (signal.isStale) {
    return {
      decision: SAFETY_DECISION_STATES.WATCH,
      confidence: 'LOW',
      planAppropriate: true,
      explanation: {
        primaryDriver: `Safety signal for ${signal.hazardType} is stale (${signal.ageMinutes || 'several'}m old).`,
        dimensions: {
          hazardSeverity: signal.severity,
          dataFreshness: 'STALE',
          temporalOverlap: temporal.state,
        },
        nextStep: 'Maintain monitoring; latest official information could not be refreshed.',
      },
    };
  }

  // 4. No Spatial / Temporal Exposure
  if (!exposure.isExposed) {
    return {
      decision: SAFETY_DECISION_STATES.CONTINUE,
      confidence: signal.confidence || 'HIGH',
      planAppropriate: true,
      explanation: {
        primaryDriver: 'No material hazard intersection with scheduled travel path.',
        dimensions: {
          hazardSeverity: signal.severity,
          exposureLevel: geospatial.exposureLevel,
          temporalOverlap: temporal.state,
        },
        nextStep: 'Continue on current planned itinerary.',
      },
    };
  }

  // 5. Significant Exposure => Evaluate REPLACE_STOP vs REROUTE vs CAUTION vs DELAY
  if (exposure.exposureBand === 'HIGH' || exposure.recommendedState === SAFETY_DECISION_STATES.REPLACE_STOP) {
    const decision = exposure.recommendedState || SAFETY_DECISION_STATES.REPLACE_STOP;

    return {
      decision,
      confidence: signal.confidence || 'HIGH',
      planAppropriate: false,
      explanation: {
        primaryDriver: `${signal.severity} ${signal.hazardType} directly overlaps planned transit during active window.`,
        dimensions: {
          hazardSeverity: signal.severity,
          hazardConfidence: signal.hazardConfidence || signal.confidence || 'HIGH',
          causeConfidence: signal.causeConfidence || 'MEDIUM',
          impactConfidence: signal.impactConfidence || 'HIGH',
          exposureScore: exposure.exposureScore,
          exposureBand: exposure.exposureBand,
          temporalOverlapMinutes: temporal.overlapMinutes,
          travelerTolerance: travelerDna.rainExposureTolerance || travelerDna.rainTolerance || 40,
        },
        nextStep: decision === SAFETY_DECISION_STATES.REPLACE_STOP
          ? 'Substitute exposed destination with indoor or low-exposure alternative.'
          : 'Exercise heightened caution along corridor; verify conditions before departure.',
      },
    };
  }

  // 6. Moderate Exposure => CAUTION or DELAY
  if (exposure.exposureBand === 'MODERATE' || signal.severity === 'WARNING' || signal.severity === 'CAUTION') {
    return {
      decision: SAFETY_DECISION_STATES.CAUTION,
      confidence: signal.confidence || 'MEDIUM',
      planAppropriate: true,
      explanation: {
        primaryDriver: `Moderate ${signal.hazardType} advisory in corridor vicinity.`,
        dimensions: {
          hazardSeverity: signal.severity,
          exposureScore: exposure.exposureScore,
          exposureBand: exposure.exposureBand,
        },
        nextStep: 'Proceed with awareness; review road conditions at upcoming checkpoint.',
      },
    };
  }

  // 7. Low Exposure => WATCH or CONTINUE
  return {
    decision: SAFETY_DECISION_STATES.WATCH,
    confidence: signal.confidence || 'MEDIUM',
    planAppropriate: true,
    explanation: {
      primaryDriver: `Minor ${signal.hazardType} in region; minimal impact on itinerary.`,
      dimensions: {
        hazardSeverity: signal.severity,
        exposureLevel: geospatial.exposureLevel,
      },
      nextStep: 'Continue current itinerary while monitoring background advisories.',
    },
  };
}

const MACRO_DECISION_STATES = Object.freeze({
  KEEP_PLAN: 'KEEP_PLAN',
  ADAPT_PLAN: 'ADAPT_PLAN',
  ALTERNATIVE_REQUIRED: 'ALTERNATIVE_REQUIRED',
});

/**
 * Deterministically maps Phase 3 Safety Decisions to Phase 1 Macro Decisions.
 *
 * Invariants:
 * - CONTINUE / WATCH / CAUTION => KEEP_PLAN
 * - DELAY / WAIT / REORDER => ADAPT_PLAN
 * - REROUTE / REPLACE_STOP / AVOID / EMERGENCY => ALTERNATIVE_REQUIRED
 * - INSUFFICIENT_DATA => KEEP_PLAN with unverified advisory
 */
function mapSafetyToMacroDecision(safetyDecision) {
  switch (safetyDecision) {
    case SAFETY_DECISION_STATES.CONTINUE:
    case SAFETY_DECISION_STATES.WATCH:
    case SAFETY_DECISION_STATES.CAUTION:
      return MACRO_DECISION_STATES.KEEP_PLAN;
    case SAFETY_DECISION_STATES.DELAY:
    case SAFETY_DECISION_STATES.WAIT:
    case SAFETY_DECISION_STATES.REORDER:
      return MACRO_DECISION_STATES.ADAPT_PLAN;
    case SAFETY_DECISION_STATES.REROUTE:
    case SAFETY_DECISION_STATES.REPLACE_STOP:
    case SAFETY_DECISION_STATES.AVOID:
    case SAFETY_DECISION_STATES.EMERGENCY:
      return MACRO_DECISION_STATES.ALTERNATIVE_REQUIRED;
    case SAFETY_DECISION_STATES.INSUFFICIENT_DATA:
    default:
      return MACRO_DECISION_STATES.KEEP_PLAN;
  }
}

module.exports = {
  SAFETY_DECISION_STATES,
  MACRO_DECISION_STATES,
  evaluateSafetyDecision,
  mapSafetyToMacroDecision,
};
