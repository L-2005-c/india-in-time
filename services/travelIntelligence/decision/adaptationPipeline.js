'use strict';

/**
 * services/travelIntelligence/decision/adaptationPipeline.js
 *
 * Contextual Plan Adaptation Pipeline for India In-Time v3.0.
 *
 * Core Principles:
 * 1. Completed stops are immutable (preserved 1:1).
 * 2. Substitutes disrupted future stops using Alternative Intelligence.
 * 3. Smoothly re-times remaining itinerary timeline under pacing lag.
 * 4. Outputs explainable diff (WHAT CHANGED, WHY, WHAT WAS PRESERVED).
 */

const { findAlternativeStop } = require('./alternativeGenerator');
const { STOP_STATUSES } = require('../journey/journeyStateEngine');

/**
 * Executes an intelligent, non-destructive plan adaptation on active journey state.
 *
 * @param {Object} journeyState
 * @param {Object} context
 * @param {Object} [travelerDna]
 * @param {Object} [guardianEvaluation]
 * @returns {Object} Adaptation Result with Plan v(N+1), diffs, and explanation
 */
function adaptJourneyPlan(journeyState, context = {}, travelerDna = {}, guardianEvaluation = {}) {
  if (!journeyState || !Array.isArray(journeyState.stops)) {
    throw new Error('Valid journeyState is required for plan adaptation');
  }

  // 1. Preserve Completed Stops (IMMUTABLE)
  const completedStops = journeyState.stops.filter(s => s.status === STOP_STATUSES.COMPLETED);
  const preservedNames = completedStops.map(s => s.name);

  // 2. Identify Disrupted Upcoming Stops
  const activeTriggers = guardianEvaluation.activeTriggers || [];
  const disruptedStopIds = new Set();
  const triggerMap = new Map();

  for (const trigger of activeTriggers) {
    if (trigger.stopId) {
      disruptedStopIds.add(trigger.stopId);
      triggerMap.set(trigger.stopId, trigger);
    }
  }

  // If Ghat road risk is critical, flag outdoor viewpoint/nature stops along the ghat
  const hasGhatRisk = activeTriggers.some(t => t.type === 'GHAT_ROAD_RISK' && t.severity === 'CRITICAL');

  const newUpcomingStops = [];
  const substitutedStops = [];
  const reTimedStops = [];

  let cursorMinute = journeyState.currentMinute || 600;

  for (const stop of journeyState.stops) {
    if (stop.status === STOP_STATUSES.COMPLETED) {
      continue; // Completed stops are kept in completed partition
    }

    const isDisrupted = disruptedStopIds.has(stop.id) ||
      (hasGhatRisk && (stop.category === 'viewpoint' || stop.category === 'nature'));

    if (isDisrupted) {
      const trigger = triggerMap.get(stop.id) || { type: 'WEATHER_RAIN', message: 'Severe weather / ghat road risk' };
      const alternative = findAlternativeStop(stop, {
        reason: trigger.type,
        travelerDna,
        currentMinute: cursorMinute,
      });

      if (alternative) {
        const replacementDuration = alternative.visitMinutes || 45;
        const newStop = {
          id: alternative.id,
          name: alternative.name,
          category: alternative.cat,
          lat: alternative.lat,
          lon: alternative.lon,
          plannedArrivalMinute: cursorMinute + 20, // 20m transit
          plannedDurationMinutes: replacementDuration,
          plannedDepartureMinute: cursorMinute + 20 + replacementDuration,
          status: STOP_STATUSES.PLANNED,
          isAlternative: true,
          replacedStopName: stop.name,
          adaptationReason: alternative.substitutionReason,
        };

        newUpcomingStops.push(newStop);
        substitutedStops.push({
          original: stop.name,
          replacement: alternative.name,
          reason: alternative.substitutionReason,
          distanceKm: alternative.distanceFromOriginalKm,
        });

        cursorMinute = newStop.plannedDepartureMinute;
        continue;
      }
    }

    // Retain stop but re-time under pacing lag
    const duration = stop.plannedDurationMinutes || 60;
    const reTimedArrival = cursorMinute + 20;
    const reTimedDeparture = reTimedArrival + duration;

    reTimedStops.push({
      name: stop.name,
      previousArrival: stop.plannedArrivalMinute,
      newArrival: reTimedArrival,
    });

    newUpcomingStops.push({
      ...stop,
      plannedArrivalMinute: reTimedArrival,
      plannedDepartureMinute: reTimedDeparture,
      projectedArrivalMinute: reTimedArrival,
      projectedDepartureMinute: reTimedDeparture,
    });

    cursorMinute = reTimedDeparture;
  }

  const nextVersion = (journeyState.activePlanVersion || 1) + 1;
  const newStopsList = [...completedStops, ...newUpcomingStops];

  // 3. Compose Human-Readable Explanation
  const explanationParts = [];
  if (substitutedStops.length > 0) {
    const subDesc = substitutedStops.map(s => `• Replaced "${s.original}" with "${s.replacement}" (${s.reason})`).join('\n');
    explanationParts.push(`Substituted ${substitutedStops.length} stop(s) for weather & safety:\n${subDesc}`);
  }
  if (reTimedStops.length > 0) {
    explanationParts.push(`Adjusted arrival times for remaining stops to accommodate current travel pace.`);
  }
  const preservedStr = preservedNames.length ? ` (${preservedNames.join(', ')})` : '';
  explanationParts.push(`All ${completedStops.length} completed stop(s)${preservedStr} were preserved without changes.`);

  return {
    shouldAdapt: true,
    previousPlanVersion: journeyState.activePlanVersion || 1,
    newPlanVersion: nextVersion,
    tripId: journeyState.tripId,
    preservedStops: preservedNames,
    substitutedStops,
    reTimedStops,
    newStopsList,
    explanation: explanationParts.join('\n\n'),
    confidence: context.provenance?.confidence || 'MEDIUM',
    adaptedAt: new Date().toISOString(),
  };
}

module.exports = {
  adaptJourneyPlan,
};
