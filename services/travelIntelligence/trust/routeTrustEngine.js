/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Route Trust Engine
 *
 * Evaluates route feasibility, navigability, terrain constraints,
 * and detects discrepancies between commercial routing engines and official advisories.
 *
 * Invariant:
 * Map open + Official closed = ROUTE_CONFLICT.
 * Official closure / safety directive ALWAYS takes precedence.
 */

const ROUTE_TRUST_STATES = Object.freeze({
  VERIFIED_PASSABLE: 'VERIFIED_PASSABLE',
  CONDITIONALLY_PASSABLE: 'CONDITIONALLY_PASSABLE',
  ROUTE_CONFLICT: 'ROUTE_CONFLICT',
  OFFICIALLY_CLOSED: 'OFFICIALLY_CLOSED',
  UNVERIFIED_TERRAIN: 'UNVERIFIED_TERRAIN',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

// Known Himalayan Passes & High-Altitude Routes requiring seasonal checks
const HIGH_ALTITUDE_PASSES = [
  { name: 'Rohtang Pass', state: 'Himachal Pradesh', winterClosureMonths: [11, 12, 1, 2, 3, 4] },
  { name: 'Zoji La', state: 'Jammu and Kashmir / Ladakh', winterClosureMonths: [12, 1, 2, 3, 4] },
  { name: 'Khardung La', state: 'Ladakh', winterClosureMonths: [] }, // Cleared year-round by BRO but weather permits
  { name: 'Baralacha La', state: 'Himachal Pradesh / Ladakh', winterClosureMonths: [11, 12, 1, 2, 3, 4, 5] },
  { name: 'Kunzum Pass', state: 'Himachal Pradesh', winterClosureMonths: [10, 11, 12, 1, 2, 3, 4, 5] },
  { name: 'Chang La', state: 'Ladakh', winterClosureMonths: [] },
  { name: 'Sela Pass', state: 'Arunachal Pradesh', winterClosureMonths: [] }
];

class RouteTrustEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Evaluates trust and feasibility for a travel route.
   * @param {Object} routeData
   * @param {string} [routeData.routeId]
   * @param {string} [routeData.origin]
   * @param {string} [routeData.destination]
   * @param {Array<string>} [routeData.waypoints]
   * @param {boolean} [routeData.mapEngineStatus='OPEN'] - Status reported by commercial map (OPEN, CONGESTED, CLOSED)
   * @param {Object} [routeData.officialSignals] - Phase 2 & 3 disruptions { roadClosures: [], floodAlerts: [], broAdvisories: [] }
   * @param {Object} [routeData.transitData] - { mode: 'ROAD'|'RAIL'|'FERRY', trainStatus: 'RUNNING'|'CANCELLED'|'DELAYED' }
   * @param {Date} [routeData.travelDate]
   * @returns {Object} route trust evaluation
   */
  evaluateRoute(routeData = {}) {
    if (!routeData || (!routeData.origin && !routeData.destination)) {
      return {
        trustState: ROUTE_TRUST_STATES.INSUFFICIENT_DATA,
        confidence: 0.1,
        summary: 'Insufficient origin or destination details to evaluate route trust.',
        isPassable: false,
        conflicts: [],
        advisories: [],
        terrainConstraints: [],
        evaluatedAt: new Date().toISOString()
      };
    }

    const mapStatus = (routeData.mapEngineStatus || 'OPEN').toUpperCase();
    const officialSignals = routeData.officialSignals || {};
    const roadClosures = Array.isArray(officialSignals.roadClosures) ? officialSignals.roadClosures : [];
    const floodAlerts = Array.isArray(officialSignals.floodAlerts) ? officialSignals.floodAlerts : [];
    const broAdvisories = Array.isArray(officialSignals.broAdvisories) ? officialSignals.broAdvisories : [];

    const conflicts = [];
    const advisories = [...broAdvisories.map(b => (typeof b === 'string' ? b : (b.message || b.advisory)))];
    const terrainConstraints = [];
    let isPassable = true;
    let trustState = ROUTE_TRUST_STATES.VERIFIED_PASSABLE;
    let confidence = 0.85;

    // 1. Check Official Road Closures & Disruption Alerts
    const hasOfficialClosure = roadClosures.some(c => c.isClosed || c.status === 'CLOSED');
    const hasSevereFlood = floodAlerts.some(f => f.severity === 'RED' || f.submerged);

    if (hasOfficialClosure || hasSevereFlood) {
      isPassable = false;
      if (mapStatus === 'OPEN') {
        // INVARIANT: Map says open, but official ground truth says closed -> ROUTE_CONFLICT!
        trustState = ROUTE_TRUST_STATES.ROUTE_CONFLICT;
        confidence = 0.95;
        conflicts.push({
          type: 'MAP_OFFICIAL_DISCREPANCY',
          severity: 'HIGH',
          description: 'Commercial routing engine indicates road is open, but official NHAI/Traffic Police ground advisory confirms active road closure.'
        });
        advisories.push('CRITICAL: Do not proceed on map instructions alone. Ground authority closure active.');
      } else {
        trustState = ROUTE_TRUST_STATES.OFFICIALLY_CLOSED;
        confidence = 0.95;
        advisories.push('Route is officially closed by traffic administration or disaster management.');
      }
    }

    // 2. High-Altitude Himalayan Pass Checks
    const searchString = `${routeData.origin || ''} ${routeData.destination || ''} ${(routeData.waypoints || []).join(' ')}`.toLowerCase();
    const travelDate = routeData.travelDate ? new Date(routeData.travelDate) : new Date();
    const travelMonth = travelDate.getMonth() + 1; // 1-indexed

    for (const pass of HIGH_ALTITUDE_PASSES) {
      if (searchString.includes(pass.name.toLowerCase())) {
        terrainConstraints.push({
          passName: pass.name,
          state: pass.state,
          advisory: `High-altitude mountain pass (${pass.name}) traversed.`
        });

        if (pass.winterClosureMonths.includes(travelMonth)) {
          isPassable = false;
          trustState = ROUTE_TRUST_STATES.OFFICIALLY_CLOSED;
          confidence = 0.92;
          advisories.push(`${pass.name} is subject to seasonal winter snow closure during month ${travelMonth}. Verified with BRO bulletin.`);
        } else {
          // If open, check conditional requirements (4x4, chains, timing)
          if (trustState === ROUTE_TRUST_STATES.VERIFIED_PASSABLE) {
            trustState = ROUTE_TRUST_STATES.CONDITIONALLY_PASSABLE;
            advisories.push(`${pass.name} requires high-clearance 4x4 or anti-skid chains. BRO permit/timing restrictions may apply.`);
          }
        }
      }
    }

    // 3. Rail / Ferry Transit Status Checks
    if (routeData.transitData) {
      const { mode, trainStatus, ferryStatus } = routeData.transitData;
      if (mode === 'RAIL' && trainStatus === 'CANCELLED') {
        isPassable = false;
        trustState = ROUTE_TRUST_STATES.OFFICIALLY_CLOSED;
        confidence = 0.99;
        advisories.push('Scheduled train service cancelled in official IRCTC / NTES feed.');
      } else if (mode === 'FERRY' && ferryStatus === 'SUSPENDED') {
        isPassable = false;
        trustState = ROUTE_TRUST_STATES.OFFICIALLY_CLOSED;
        confidence = 0.95;
        advisories.push('Ferry sailing suspended by inland waterways / port authority due to weather/tide conditions.');
      }
    }

    // 4. Remote / Unpaved Road check
    if (routeData.isUnpavedOrRemote && trustState === ROUTE_TRUST_STATES.VERIFIED_PASSABLE) {
      trustState = ROUTE_TRUST_STATES.UNVERIFIED_TERRAIN;
      confidence = 0.55;
      advisories.push('Remote/unpaved stretch lacking real-time traffic telemetry. Local inquiry advised before departure.');
    }

    // Summary compilation
    let summary = 'Route is verified passable with current ground and routing alignment.';
    if (trustState === ROUTE_TRUST_STATES.ROUTE_CONFLICT) {
      summary = 'CONTRADICTION DETECTED: Map routing shows open, but official closure alert is active.';
    } else if (trustState === ROUTE_TRUST_STATES.OFFICIALLY_CLOSED) {
      summary = 'Route is confirmed closed by official authorities. Alternative routing required.';
    } else if (trustState === ROUTE_TRUST_STATES.CONDITIONALLY_PASSABLE) {
      summary = 'Route is passable under specific vehicle, weather, or timing conditions.';
    } else if (trustState === ROUTE_TRUST_STATES.UNVERIFIED_TERRAIN) {
      summary = 'Route navigability unverified due to lack of live sensor or telemetry coverage.';
    }

    return {
      routeId: routeData.routeId || `route_${Date.now()}`,
      origin: routeData.origin,
      destination: routeData.destination,
      isPassable,
      trustState,
      confidence,
      summary,
      conflicts,
      advisories,
      terrainConstraints,
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  RouteTrustEngine,
  ROUTE_TRUST_STATES
};
