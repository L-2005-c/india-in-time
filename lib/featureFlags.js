/**
 * Enterprise feature flags — env-driven, overridable at runtime via admin API.
 * Flags default to safe production values.
 */
const defaults = {
  aiEnabled: process.env.FF_AI_ENABLED !== 'false',
  timeIntelligenceEnabled: process.env.FF_TIME_INTEL_ENABLED !== 'false',
  mlCrowdEnabled: process.env.FF_ML_CROWD_ENABLED !== 'false',
  liveRoutingEnabled: process.env.FF_LIVE_ROUTING_ENABLED !== 'false',
  analyticsEnabled: process.env.FF_ANALYTICS_ENABLED !== 'false',
  multiProviderFailover: process.env.FF_MULTI_PROVIDER_FAILOVER === 'true',
  maintenanceMode: process.env.FF_MAINTENANCE_MODE === 'true',
};

const overrides = Object.create(null);

function getFlag(name) {
  if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
  if (Object.prototype.hasOwnProperty.call(defaults, name)) return defaults[name];
  return false;
}

function setFlag(name, value) {
  overrides[name] = !!value;
  return getFlag(name);
}

function clearOverride(name) {
  delete overrides[name];
}

function listFlags() {
  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
  const out = {};
  for (const k of keys) out[k] = getFlag(k);
  return out;
}

/** Express middleware: 503 when maintenance mode is on (except health). */
function maintenanceGuard(req, res, next) {
  if (!getFlag('maintenanceMode')) return next();
  if (req.path.startsWith('/api/health') || req.path === '/api/ready') return next();
  return res.status(503).json({
    error: 'Service temporarily unavailable (maintenance mode)',
    code: 'MAINTENANCE_MODE',
  });
}

/** Block AI routes when AI flag off. */
function requireAiEnabled(req, res, next) {
  if (getFlag('aiEnabled')) return next();
  return res.status(503).json({ error: 'AI features disabled', code: 'FF_AI_DISABLED' });
}

module.exports = {
  getFlag,
  setFlag,
  clearOverride,
  listFlags,
  maintenanceGuard,
  requireAiEnabled,
};
