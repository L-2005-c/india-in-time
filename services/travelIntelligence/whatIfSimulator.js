'use strict';

/**
 * services/travelIntelligence/whatIfSimulator.js
 * Trip Scenario Simulation & "What-If" Engine.
 * Allows travelers to test counterfactual scenarios without mutating their active itinerary.
 */

/**
 * Simulates an alternative travel scenario and generates a comparative diff against the baseline plan.
 */
function simulateScenario(candidates = [], currentPlan = {}, scenario = {}) {
  const { planAdvancedItinerary } = require('./advancedItineraryEngine');
  const baseReq = currentPlan?.requirements || {};
  const simOptions = {
    ...baseReq,
    startMin: scenario.startMin ?? baseReq.hard?.startMin ?? 540,
    endMin: scenario.endMin ?? baseReq.hard?.endMin ?? 1140,
    preferredCategories: scenario.preferredCategories || baseReq.soft?.preferredCategories || [],
    excludedCategories: scenario.excludedCategories || baseReq.hard?.excludedCategories || [],
    mustVisit: scenario.mustVisit || baseReq.hard?.mustVisit || [],
    mustAvoidPlaces: scenario.mustAvoidPlaces || baseReq.hard?.mustAvoidPlaces || [],
    weather: scenario.weather || baseReq.weather || { tempC: 28, condition: 'Clear' },
    trafficMultiplier: scenario.trafficMultiplier || 1.0,
    tripMode: scenario.tripMode || baseReq.soft?.tripMode || 'balanced',
    originCoords: scenario.originCoords || baseReq.originCoords || [17.6868, 83.2185],
  };

  // Run authoritative planner with simulated variables
  const simulatedPlan = planAdvancedItinerary(candidates, simOptions);

  const curStops = currentPlan.stops || [];
  const simStops = simulatedPlan.stops || [];

  const curTravelMin = Number(currentPlan.totalTravelMinutes || 0);
  const simTravelMin = Number(simulatedPlan.totalTravelMinutes || 0);
  const travelDelta = simTravelMin - curTravelMin;

  const curScore = Number(currentPlan.itineraryQualityScore || currentPlan.totalScore || 85);
  const simScore = Number(simulatedPlan.itineraryQualityScore || simulatedPlan.totalScore || 85);
  const qualityDelta = simScore - curScore;

  const curCost = Number(currentPlan.estimatedCost || 0);
  const simCost = Number(simulatedPlan.estimatedCost || 0);
  const costDelta = Math.round((simCost - curCost) * 100) / 100;

  const curNames = curStops.map(s => s.name);
  const simNames = simStops.map(s => s.name);
  const added = simNames.filter(n => !curNames.includes(n));
  const dropped = curNames.filter(n => !simNames.includes(n));

  const differences = [];
  if (travelDelta !== 0) differences.push(`Travel time ${travelDelta > 0 ? `+${travelDelta}` : travelDelta} mins`);
  if (costDelta !== 0) differences.push(`Cost ${costDelta > 0 ? `+₹${costDelta}` : `-₹${Math.abs(costDelta)}`}`);
  if (qualityDelta !== 0) differences.push(`Quality Score ${qualityDelta > 0 ? `+${qualityDelta}` : qualityDelta} pts`);
  if (added.length) differences.push(`Added: ${added.join(', ')}`);
  if (dropped.length) differences.push(`Removed: ${dropped.join(', ')}`);

  return {
    scenarioId: scenario.id || 'custom_what_if',
    scenarioTitle: scenario.title || 'Simulated Alternative Scenario',
    simulatedPlan,
    comparison: {
      travelTimeDeltaMin: travelDelta,
      costDeltaRupees: costDelta,
      qualityScoreDeltaPts: qualityDelta,
      stopCountDelta: simStops.length - curStops.length,
      addedStops: added,
      droppedStops: dropped,
      differences,
      summary: differences.length ? differences.join(' • ') : 'Identical schedule feasibility',
    },
  };
}

module.exports = {
  simulateScenario,
};
