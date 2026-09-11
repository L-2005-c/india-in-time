'use strict';

/**
 * services/travelIntelligence/nextJourney/index.js
 *
 * Central export barrel for India In-Time v3.0 Phase 6: Next Journey Intelligence.
 */

const journeyLegModel = require('./journeyLegModel');
const destinationIntentResolver = require('./destinationIntentResolver');
const accommodationIntelligence = require('./accommodationIntelligence');
const corridorDiningEngine = require('./corridorDiningEngine');
const transportHubEngine = require('./transportHubEngine');
const overnightStayEngine = require('./overnightStayEngine');
const nextLegDecisionEngine = require('./nextLegDecisionEngine');
const nextJourneyObservability = require('./nextJourneyObservability');

module.exports = {
  ...journeyLegModel,
  ...destinationIntentResolver,
  ...accommodationIntelligence,
  ...corridorDiningEngine,
  ...transportHubEngine,
  ...overnightStayEngine,
  ...nextLegDecisionEngine,
  ...nextJourneyObservability,
  nextJourneyObservability: nextJourneyObservability.nextJourneyObservability || nextJourneyObservability,
  findAccommodationCandidates: accommodationIntelligence.findCandidateAccommodations,
  evaluateCompoundDiningLeg: corridorDiningEngine.evaluateCorridorDiningChain,
  evaluateTransportHubDeadline: transportHubEngine.evaluateTransportDeadline,
  evaluateOvernightStayNeed: overnightStayEngine.evaluateOvernightViability,
  decideNextLegDecision: nextLegDecisionEngine.evaluateNextLegDecision,
  CHECKIN_FEASIBILITY: accommodationIntelligence.CHECKIN_STATES,
  DEADLINE_RISK_STATES: transportHubEngine.DEADLINE_STATES,
};
