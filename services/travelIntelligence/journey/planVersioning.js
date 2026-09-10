'use strict';

/**
 * services/travelIntelligence/journey/planVersioning.js
 *
 * Plan Versioning & Audit Trail Engine for India In-Time v3.0.
 * Tracks every evolution of an itinerary from Plan v1 -> Plan v2 -> Plan vN.
 */

const appLogger = require('../../../lib/logger');

// In-memory version registry for testing and fast local retrieval
const inMemoryVersions = new Map();

/**
 * Commits a new plan version following an adaptation or traveler edit.
 */
async function commitPlanVersion({
  tripId,
  versionNumber,
  triggerType = 'MANUAL_EDIT',
  triggerReason = 'Itinerary updated',
  plan,
  changedStops = [],
  preservedStops = [],
  confidence = 'HIGH',
  dbPool = null,
}) {
  const versionRecord = {
    tripId: String(tripId),
    versionNumber: Number(versionNumber),
    triggerType: String(triggerType),
    triggerReason: String(triggerReason),
    plan,
    changedStops,
    preservedStops,
    confidence: String(confidence),
    createdAt: new Date().toISOString(),
  };

  if (!inMemoryVersions.has(tripId)) {
    inMemoryVersions.set(tripId, []);
  }
  const history = inMemoryVersions.get(tripId);
  history.push(versionRecord);

  if (dbPool) {
    try {
      const q = `
        INSERT INTO plan_versions (
          trip_id, version_number, trigger_type, trigger_reason,
          plan_json, changed_stops_json, preserved_stops_json, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (trip_id, version_number) DO NOTHING;
      `;
      await dbPool.query(q, [
        tripId,
        versionNumber,
        triggerType,
        triggerReason,
        JSON.stringify(plan),
        JSON.stringify(changedStops),
        JSON.stringify(preservedStops),
        confidence,
      ]);
    } catch (err) {
      appLogger.warn(`[planVersioning] Failed to persist plan version to DB: ${err.message}`);
    }
  }

  return versionRecord;
}

/**
 * Retrieves the full adaptation history for a given trip.
 */
async function getPlanVersionHistory(tripId, dbPool = null) {
  if (dbPool) {
    try {
      const q = `
        SELECT trip_id, version_number, trigger_type, trigger_reason,
               plan_json, changed_stops_json, preserved_stops_json, confidence, created_at
        FROM plan_versions
        WHERE trip_id = $1
        ORDER BY version_number ASC;
      `;
      const res = await dbPool.query(q, [tripId]);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => ({
          tripId: r.trip_id,
          versionNumber: r.version_number,
          triggerType: r.trigger_type,
          triggerReason: r.trigger_reason,
          plan: JSON.parse(r.plan_json),
          changedStops: r.changed_stops_json ? JSON.parse(r.changed_stops_json) : [],
          preservedStops: r.preserved_stops_json ? JSON.parse(r.preserved_stops_json) : [],
          confidence: r.confidence,
          createdAt: r.created_at,
        }));
      }
    } catch (err) {
      appLogger.warn(`[planVersioning] DB history query failed, falling back to memory: ${err.message}`);
    }
  }

  return inMemoryVersions.get(tripId) || [];
}

module.exports = {
  commitPlanVersion,
  getPlanVersionHistory,
  inMemoryVersions,
};
