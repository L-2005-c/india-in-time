'use strict';

/**
 * services/travelIntelligence/experience/candidateGenerator.js
 *
 * Grounded Experience Candidate Generator for India In-Time v3.0 Phase 4.
 * Generates verified, grounded candidate actions without hallucinating missing POIs.
 *
 * Candidate Sources:
 * 1. PLANNED_STOP: Upcoming planned stops in active JourneyState
 * 2. REGIONAL_HAVEN: Curated indoor / sheltered havens from alternativeGenerator
 * 3. CITY_SEED: Authoritative city seeds from data/city-seeds
 * 4. CUSTOM_POOL: Explicitly passed candidate pool
 */

const { STOP_STATUSES } = require('../journey/journeyStateEngine');
const { REGIONAL_ALTERNATIVE_HAVENS } = require('../decision/alternativeGenerator');
const { staticCityPlaces } = require('../../../data/city-seeds');
const { distKm } = require('../../../utils/geo');

/**
 * Normalizes a raw place tuple or object into a canonical candidate structure.
 */
function normalizeCandidate(raw, provenance = 'UNKNOWN', originLoc = null) {
  if (!raw) return null;

  let id, name, cat, lat, lon, visitMinutes, ot, ct, indoorOutdoor;

  if (Array.isArray(raw)) {
    // Array tuple format from city-seeds: [name, cat, lat, lon, visitMinutes, ot, ct]
    [name, cat, lat, lon, visitMinutes, ot, ct] = raw;
    id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    indoorOutdoor = ['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping'].includes(String(cat).toLowerCase())
      ? 'indoor'
      : 'outdoor';
  } else {
    // Object format
    id = String(raw.id || raw.place_id || raw.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    name = raw.name || raw.canonicalName || 'Destination';
    cat = raw.cat || raw.category || 'attraction';
    lat = Number(raw.lat || raw.latitude || raw.coords?.[0]);
    lon = Number(raw.lon || raw.longitude || raw.coords?.[1]);
    visitMinutes = Number(raw.plannedDurationMinutes || raw.visitMinutes || raw.visit_minutes || 60);
    ot = raw.ot || raw.open_time || raw.openingHours?.open || null;
    ct = raw.ct || raw.close_time || raw.openingHours?.close || null;
    indoorOutdoor = raw.indoorOutdoor || (
      ['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping'].includes(String(cat).toLowerCase())
        ? 'indoor'
        : 'outdoor'
    );
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let distanceKm = null;
  if (originLoc && Number.isFinite(originLoc.lat) && Number.isFinite(originLoc.lon)) {
    distanceKm = Math.round(distKm(originLoc.lat, originLoc.lon, lat, lon) * 10) / 10;
  }

  return {
    id,
    name,
    cat: String(cat).toLowerCase(),
    lat,
    lon,
    visitMinutes: Math.max(15, visitMinutes || 60),
    ot,
    ct,
    indoorOutdoor,
    provenance,
    distanceKm,
    originalStopId: raw.originalStopId || raw.id || null,
    status: raw.status || null,
    is_sunset_spot: !!(raw.is_sunset_spot || raw.isSunsetSpot),
    is_sunrise_spot: !!(raw.is_sunrise_spot || raw.isSunriseSpot),
    rawCandidate: raw,
  };
}

/**
 * Generates grounded candidates for an active journey.
 *
 * @param {Object} options
 * @param {Object} options.journeyState - Active JourneyState
 * @param {string} [options.cityName='visakhapatnam'] - City or region key
 * @param {Object} [options.currentLocation] - Traveler's current coordinates {lat, lon}
 * @param {Array<Object>} [options.customPool] - Custom candidate POIs
 * @param {number} [options.maxRadiusKm=40] - Maximum search distance
 * @param {Array<Object>} [options.activeHazards] - Active hazard list to prune
 * @returns {Array<Object>} Verified, grounded candidate places
 */
function generateCandidates({
  journeyState = {},
  cityName = 'visakhapatnam',
  currentLocation = null,
  customPool = [],
  maxRadiusKm = 45,
  activeHazards = [],
} = {}) {
  const originLoc = currentLocation || journeyState?.currentLocation || (
    journeyState?.activeStop ? { lat: journeyState.activeStop.lat, lon: journeyState.activeStop.lon } : null
  );

  const candidates = [];
  const seenIds = new Set();

  // 1. Upcoming Planned Stops from Journey State (Highest Priority)
  const stops = Array.isArray(journeyState?.stops) ? journeyState.stops : [];
  for (const stop of stops) {
    if (stop.status === STOP_STATUSES.COMPLETED || stop.status === STOP_STATUSES.SKIPPED) {
      continue; // NEVER re-suggest completed or skipped stops
    }
    const c = normalizeCandidate(stop, 'PLANNED_STOP', originLoc);
    if (c && !seenIds.has(c.id)) {
      seenIds.add(c.id);
      candidates.push(c);
    }
  }

  // 2. Curated Regional Sheltered Havens
  for (const haven of REGIONAL_ALTERNATIVE_HAVENS) {
    const c = normalizeCandidate(haven, 'REGIONAL_HAVEN', originLoc);
    if (c && !seenIds.has(c.id)) {
      if (originLoc && c.distanceKm != null && c.distanceKm > maxRadiusKm) continue;
      seenIds.add(c.id);
      candidates.push(c);
    }
  }

  // 3. Static Curated City Seeds
  const cityKey = String(cityName || 'visakhapatnam').trim().toLowerCase();
  const seedPlaces = staticCityPlaces(cityKey);
  if (Array.isArray(seedPlaces)) {
    for (const seed of seedPlaces) {
      const c = normalizeCandidate(seed, 'CITY_SEED', originLoc);
      if (c && !seenIds.has(c.id)) {
        if (originLoc && c.distanceKm != null && c.distanceKm > maxRadiusKm) continue;
        seenIds.add(c.id);
        candidates.push(c);
      }
    }
  }

  // 4. Custom Pool (if provided)
  if (Array.isArray(customPool)) {
    for (const item of customPool) {
      const c = normalizeCandidate(item, 'CUSTOM_POOL', originLoc);
      if (c && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        candidates.push(c);
      }
    }
  }

  // 5. Prune candidates under active safety hazards
  const safeCandidates = candidates.filter(cand => {
    for (const hazard of activeHazards) {
      if (hazard.status === 'ACTIVE' && hazard.severity === 'CRITICAL') {
        if (hazard.targetPlaceId && hazard.targetPlaceId === cand.id) return false;
        if (hazard.lat && hazard.lon && cand.lat && cand.lon) {
          const d = distKm(hazard.lat, hazard.lon, cand.lat, cand.lon);
          if (d <= (hazard.radiusKm || 5)) return false;
        }
      }
    }
    return true;
  });

  return safeCandidates;
}

module.exports = {
  normalizeCandidate,
  generateCandidates,
};
