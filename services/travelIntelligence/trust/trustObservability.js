/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Trust Observability & Telemetry
 *
 * Tracks evaluation counts, trust state distributions, registry verification hit rates,
 * and route conflict detection rates.
 *
 * CRITICAL RULE:
 * Strictly distinguishes LIVE evaluations from SIMULATED test evaluations.
 */

class TrustObservability {
  constructor() {
    this.reset();
  }

  reset() {
    this.metrics = {
      live: {
        totalEvaluations: 0,
        byObjectType: {},
        byTrustState: {},
        routeConflictsDetected: 0,
        safetyOverridesTriggered: 0,
        registryChecks: {
          nidhi: { attempted: 0, verified: 0 },
          fssai: { attempted: 0, verified: 0 },
          gstin: { attempted: 0, verified: 0 }
        },
        latenciesMs: []
      },
      simulated: {
        totalEvaluations: 0,
        byObjectType: {},
        byTrustState: {},
        routeConflictsDetected: 0,
        safetyOverridesTriggered: 0,
        registryChecks: {
          nidhi: { attempted: 0, verified: 0 },
          fssai: { attempted: 0, verified: 0 },
          gstin: { attempted: 0, verified: 0 }
        },
        latenciesMs: []
      }
    };
  }

  /**
   * Records a trust evaluation event.
   * @param {Object} event
   * @param {boolean} [event.isSimulated=false]
   * @param {string} event.objectType
   * @param {string} event.trustState
   * @param {boolean} [event.hasRouteConflict=false]
   * @param {boolean} [event.safetyOverride=false]
   * @param {Array<Object>} [event.registryVerifications]
   * @param {number} [event.latencyMs=0]
   */
  recordEvaluation(event = {}) {
    const mode = event.isSimulated ? 'simulated' : 'live';
    const target = this.metrics[mode];

    target.totalEvaluations++;

    // By object type
    const oType = event.objectType || 'UNKNOWN';
    target.byObjectType[oType] = (target.byObjectType[oType] || 0) + 1;

    // By trust state
    const tState = event.trustState || 'UNKNOWN';
    target.byTrustState[tState] = (target.byTrustState[tState] || 0) + 1;

    if (event.hasRouteConflict) {
      target.routeConflictsDetected++;
    }

    if (event.safetyOverride) {
      target.safetyOverridesTriggered++;
    }

    if (Array.isArray(event.registryVerifications)) {
      for (const v of event.registryVerifications) {
        const reg = (v.registry || '').toLowerCase();
        if (target.registryChecks[reg]) {
          target.registryChecks[reg].attempted++;
          if (v.verified) {
            target.registryChecks[reg].verified++;
          }
        }
      }
    }

    if (typeof event.latencyMs === 'number' && event.latencyMs >= 0) {
      target.latenciesMs.push(event.latencyMs);
      if (target.latenciesMs.length > 500) {
        target.latenciesMs.shift();
      }
    }
  }

  /**
   * Returns formatted telemetry metrics separating LIVE and SIMULATED.
   * @returns {Object}
   */
  getMetrics() {
    const calcStats = (arr) => {
      if (arr.length === 0) return { avg: 0, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const avg = Number((sum / sorted.length).toFixed(2));
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
      return { avg, p95 };
    };

    return {
      live: {
        totalEvaluations: this.metrics.live.totalEvaluations,
        byObjectType: { ...this.metrics.live.byObjectType },
        byTrustState: { ...this.metrics.live.byTrustState },
        routeConflictsDetected: this.metrics.live.routeConflictsDetected,
        safetyOverridesTriggered: this.metrics.live.safetyOverridesTriggered,
        registryChecks: JSON.parse(JSON.stringify(this.metrics.live.registryChecks)),
        latencyStats: calcStats(this.metrics.live.latenciesMs)
      },
      simulated: {
        totalEvaluations: this.metrics.simulated.totalEvaluations,
        byObjectType: { ...this.metrics.simulated.byObjectType },
        byTrustState: { ...this.metrics.simulated.byTrustState },
        routeConflictsDetected: this.metrics.simulated.routeConflictsDetected,
        safetyOverridesTriggered: this.metrics.simulated.safetyOverridesTriggered,
        registryChecks: JSON.parse(JSON.stringify(this.metrics.simulated.registryChecks)),
        latencyStats: calcStats(this.metrics.simulated.latenciesMs)
      },
      timestamp: new Date().toISOString()
    };
  }
}

const trustObservability = new TrustObservability();

module.exports = {
  TrustObservability,
  trustObservability
};
