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

  // Phase 15 Production Hardening Flags
  trafficV2: process.env.FF_TRAFFIC_V2 !== 'false',
  poiVerificationV2: process.env.FF_POI_VERIFICATION_V2 !== 'false',
  routingV2: process.env.FF_ROUTING_V2 !== 'false',
  mapPerformanceV2: process.env.FF_MAP_PERFORMANCE_V2 !== 'false',
  decisionEngineV2: process.env.FF_DECISION_ENGINE_V2 !== 'false',
};

const overrides = Object.create(null);

// Flag name normalization (e.g., 'TRAFFIC_V2' -> 'trafficV2')
function normalizeFlagName(name) {
  if (!name || typeof name !== 'string') return '';
  const camel = name.toLowerCase().replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  return camel;
}

function getFlag(name) {
  const norm = normalizeFlagName(name);
  if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
  if (Object.prototype.hasOwnProperty.call(overrides, norm)) return overrides[norm];
  if (Object.prototype.hasOwnProperty.call(defaults, name)) return defaults[name];
  if (Object.prototype.hasOwnProperty.call(defaults, norm)) return defaults[norm];
  return false;
}

function setFlag(name, value) {
  const norm = normalizeFlagName(name);
  overrides[norm] = !!value;
  overrides[name] = !!value;
  return getFlag(name);
}

function killSwitch(name) {
  return setFlag(name, false);
}

function clearOverride(name) {
  const norm = normalizeFlagName(name);
  delete overrides[name];
  delete overrides[norm];
}

function listFlags() {
  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
  const out = {};
  for (const k of keys) out[k] = getFlag(k);
  return out;
}

/**
 * Deterministic canary percentage rollout for an entity (user, session, journey).
 */
function evaluateCanary(flagName, entityId = 'anonymous', rolloutPercentage = 100) {
  if (!getFlag(flagName)) return false;
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;

  let hash = 0;
  const str = `${flagName}:${entityId}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const bucket = hash % 100;
  return bucket < rolloutPercentage;
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
  killSwitch,
  clearOverride,
  listFlags,
  evaluateCanary,
  maintenanceGuard,
  requireAiEnabled,
};
