'use strict';

/**
 * services/travelIntelligence/nextJourney/journeyLegModel.js
 *
 * Canonical Journey Leg Model & Continuous Journey Chaining Engine (Phase 6).
 *
 * Enforces Architectural Invariants:
 * 1. COMPLETED LEGS ARE PERMANENTLY IMMUTABLE.
 *    Once a leg reaches COMPLETED, its origin, destination, stops, outcomes,
 *    and plan history cannot be rewritten or mutated by subsequent legs.
 * 2. Strict status lifecycle:
 *    PLANNED -> READY -> ACTIVE -> COMPLETED (or PAUSED / ADAPTING / CANCELLED).
 * 3. Continuous Journey Chaining:
 *    Leg 1 -> Leg 2 -> Leg 3 -> ... linked via parentLegId and legNumber.
 */

const crypto = require('crypto');
const appLogger = require('../../../lib/logger');

const LEG_STATUSES = Object.freeze({
  PLANNED: 'PLANNED',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ADAPTING: 'ADAPTING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [LEG_STATUSES.PLANNED]: [LEG_STATUSES.READY, LEG_STATUSES.CANCELLED],
  [LEG_STATUSES.READY]: [LEG_STATUSES.ACTIVE, LEG_STATUSES.CANCELLED],
  [LEG_STATUSES.ACTIVE]: [LEG_STATUSES.PAUSED, LEG_STATUSES.ADAPTING, LEG_STATUSES.COMPLETED, LEG_STATUSES.CANCELLED],
  [LEG_STATUSES.PAUSED]: [LEG_STATUSES.ACTIVE, LEG_STATUSES.CANCELLED],
  [LEG_STATUSES.ADAPTING]: [LEG_STATUSES.ACTIVE, LEG_STATUSES.COMPLETED, LEG_STATUSES.CANCELLED],
  [LEG_STATUSES.COMPLETED]: [],
  [LEG_STATUSES.CANCELLED]: [],
});

// In-memory registry for journey chains and active legs
const inMemoryJourneys = new Map();

/**
 * Creates a canonical JourneyLeg instance.
 */
function createJourneyLeg({
  legId = null,
  journeyId,
  parentLegId = null,
  legNumber = 1,
  legIndex = 1,
  origin = { name: 'Origin' },
  destination = { name: 'Destination' },
  destinationIntent = 'CONTINUE_TO_DESTINATION',
  status = LEG_STATUSES.PLANNED,
  planVersion = 1,
  travelerProfileVersion = 'v1.0',
  constraints = {},
  plan = {},
  stops = [],
} = {}) {
  if (!journeyId) throw new Error('journeyId is required to create a JourneyLeg');

  const id = legId || `leg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const effectiveIndex = Number(legIndex != null ? legIndex : legNumber) || 1;
  const isCompleted = status === LEG_STATUSES.COMPLETED;

  return {
    legId: String(id),
    journeyId: String(journeyId),
    parentLegId: parentLegId ? String(parentLegId) : null,
    legNumber: effectiveIndex,
    legIndex: effectiveIndex,
    origin: typeof origin === 'string' ? { name: origin } : (origin || { name: 'Origin' }),
    destination: typeof destination === 'string' ? { name: destination } : (destination || { name: 'Destination' }),
    destinationIntent: String(destinationIntent),
    status: LEG_STATUSES[status] || LEG_STATUSES.PLANNED,
    isImmutable: Boolean(isCompleted),
    planVersion: Number(planVersion) || 1,
    travelerProfileVersion: String(travelerProfileVersion),
    constraints: constraints || {},
    plan: plan || {},
    stops: Array.isArray(stops) ? stops : [],
    completedStops: (Array.isArray(stops) ? stops : []).filter(s => s.status === 'COMPLETED'),
    upcomingStops: (Array.isArray(stops) ? stops : []).filter(s => s.status !== 'COMPLETED'),
    startedAt: status === LEG_STATUSES.ACTIVE ? now : null,
    completedAt: isCompleted ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transitions a journey leg to a new status with strict immutability checks.
 */
function transitionLegStatus(leg, nextStatus, options = {}) {
  if (!leg || !leg.legId) throw new Error('Valid leg object is required');
  const targetStatus = LEG_STATUSES[nextStatus];
  if (!targetStatus) throw new Error(`Invalid leg status: '${nextStatus}'`);

  // IMMUTABILITY GUARANTEE: A completed leg cannot be modified or re-transitioned
  if (leg.status === LEG_STATUSES.COMPLETED || leg.isImmutable) {
    throw new Error(`Cannot mutate or transition completed leg '${leg.legId}' (COMPLETED and permanently immutable). Cannot transition to '${nextStatus}'.`);
  }

  // Lifecycle validation
  const allowed = ALLOWED_TRANSITIONS[leg.status] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`Invalid status transition from '${leg.status}' to '${targetStatus}'.`);
  }

  const updated = JSON.parse(JSON.stringify(leg));
  const now = options.timestamp || new Date().toISOString();

  updated.status = targetStatus;
  updated.updatedAt = now;

  if (targetStatus === LEG_STATUSES.ACTIVE && !updated.startedAt) {
    updated.startedAt = now;
  } else if (targetStatus === LEG_STATUSES.COMPLETED) {
    updated.completedAt = now;
    updated.isImmutable = true;
    // Mark all remaining stops as completed
    if (Array.isArray(updated.stops)) {
      updated.stops.forEach(s => {
        if (s.status !== 'SKIPPED') s.status = 'COMPLETED';
      });
      updated.completedStops = [...updated.stops];
      updated.upcomingStops = [];
    }
  }

  if (options.reason) {
    updated.statusChangeReason = options.reason;
  }

  return updated;
}

/**
 * Initializes or retrieves a Journey Chain containing ordered legs.
 */
function getOrCreateJourneyChain(journeyId, initialTripData = null) {
  const jid = String(journeyId);
  if (inMemoryJourneys.has(jid)) {
    return inMemoryJourneys.get(jid);
  }

  const chain = {
    journeyId: jid,
    legs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (initialTripData) {
    const leg1 = createJourneyLeg({
      journeyId: jid,
      legNumber: 1,
      legIndex: 1,
      origin: initialTripData.origin || { name: initialTripData.city || 'Trip Origin' },
      destination: initialTripData.destination || { name: (initialTripData.stops?.[initialTripData.stops.length - 1]?.name) || 'Final Destination' },
      destinationIntent: 'CONTINUE_TO_DESTINATION',
      status: initialTripData.status || LEG_STATUSES.PLANNED,
      plan: initialTripData.plan || {},
      stops: initialTripData.stops || [],
    });
    chain.legs.push(leg1);
  }

  inMemoryJourneys.set(jid, chain);
  return chain;
}

/**
 * Appends a new leg to a journey chain, enforcing parent link and immutability of prior legs.
 */
function appendNextLeg(journeyId, nextLegOptions = {}) {
  const chain = getOrCreateJourneyChain(journeyId);
  const priorLeg = chain.legs[chain.legs.length - 1];

  const legNumber = chain.legs.length + 1;
  const parentLegId = priorLeg ? priorLeg.legId : null;

  // Origin defaults to previous leg's destination
  const origin = nextLegOptions.origin || (priorLeg ? priorLeg.destination : { name: 'Current Location' });

  const nextLeg = createJourneyLeg({
    journeyId,
    parentLegId,
    legNumber,
    legIndex: legNumber,
    origin,
    destination: nextLegOptions.destination,
    destinationIntent: nextLegOptions.destinationIntent || 'CONTINUE_TO_DESTINATION',
    status: nextLegOptions.status || LEG_STATUSES.PLANNED,
    planVersion: 1,
    constraints: nextLegOptions.constraints || {},
    plan: nextLegOptions.plan || {},
    stops: nextLegOptions.stops || [],
  });

  chain.legs.push(nextLeg);
  chain.updatedAt = new Date().toISOString();
  inMemoryJourneys.set(String(journeyId), chain);

  appLogger.info(`[journeyLegModel] Appended Leg ${legNumber} (${nextLeg.legId}) to Journey ${journeyId}`);
  return nextLeg;
}

/**
 * Retrieves the full journey chain history.
 */
function getJourneyLegHistory(journeyId) {
  const chain = inMemoryJourneys.get(String(journeyId));
  if (!chain) return [];
  // Return deep clone to protect immutability
  return JSON.parse(JSON.stringify(chain.legs));
}

/**
 * Retrieves the currently active or most recent leg in the chain.
 */
function getCurrentLeg(journeyId) {
  const legs = getJourneyLegHistory(journeyId);
  if (!legs.length) return null;
  // Look for ACTIVE or PLANNED leg, otherwise return the latest completed leg
  return legs.find(l => l.status === LEG_STATUSES.ACTIVE) ||
         legs.find(l => l.status === LEG_STATUSES.PLANNED) ||
         legs[legs.length - 1];
}

/**
 * Clears in-memory state (useful for test isolation).
 */
function resetJourneyMemory() {
  inMemoryJourneys.clear();
}

module.exports = {
  LEG_STATUSES,
  createJourneyLeg,
  createCanonicalJourneyLeg: createJourneyLeg,
  transitionLegStatus,
  getOrCreateJourneyChain,
  appendNextLeg,
  getJourneyLegHistory,
  getCurrentLeg,
  resetJourneyMemory,
};
