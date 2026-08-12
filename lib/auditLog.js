/**
 * Enterprise audit log — security-sensitive actions (auth failures, admin,
 * data export, feedback abuse signals). Writes structured lines via pino
 * and optionally persists to audit_log table.
 */
const logger = require('./logger');

async function writeAudit({ action, actor, resource, outcome, meta, ip, requestId }) {
  const entry = {
    type: 'audit',
    action,
    actor: actor || 'anonymous',
    resource: resource || null,
    outcome: outcome || 'success',
    meta: meta || undefined,
    ip: ip || undefined,
    rid: requestId || undefined,
    ts: new Date().toISOString(),
  };
  logger.info(entry, `audit:${action}`);

  try {
    const { getDb } = require('../db/init');
    const pool = getDb();
    if (!pool) return;
    await pool.query(
      `INSERT INTO audit_log (action, actor, resource, outcome, meta_json, ip, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        action,
        entry.actor,
        entry.resource,
        entry.outcome,
        meta ? JSON.stringify(meta) : null,
        ip || null,
        requestId || null,
      ]
    );
  } catch (_e) {
    /* table may not exist yet — log-only is still valuable */
  }
}

module.exports = { writeAudit };
