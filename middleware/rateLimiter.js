// middleware/rateLimiter.js — Per-IP sliding window rate limiting
//
// Default: in-memory, per-worker-process (see the clustering note in
// server.js — this is exactly the state that comment warns about). Fine as
// long as CLUSTER_WORKERS stays at 1.
//
// Set REDIS_URL (and keep `ioredis` installed) to switch to a single shared
// counter across every worker/instance — server.js will then also safely
// raise CLUSTER_WORKERS above 1 on its own. If Redis is unreachable at
// request time, requests fail OPEN (allowed through) rather than taking the
// whole API down with it.

const config = require('../config');

// Store: IP → { count, windowStart, tier counts }   (in-memory fallback)
const ipStore = new Map();

// Cleanup old entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipStore) {
    if (now - data.windowStart > config.rateLimit.windowMs * 2) {
      ipStore.delete(ip);
    }
  }
}, 2 * 60 * 1000).unref();

// ── Optional Redis backend ──────────────────────────────────────────────────
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    redis.on('error', (err) => console.warn('[rateLimiter] Redis error (failing open):', err.message));
    redis.on('connect', () => console.log('[rateLimiter] ✅ Redis connected — using distributed rate limiting (safe to raise CLUSTER_WORKERS now)'));
  } catch (_e) {
    console.warn('[rateLimiter] REDIS_URL is set but `ioredis` isn\'t installed — run `npm install ioredis`. Falling back to per-worker in-memory limiting.');
    redis = null;
  }
} else {
  console.log('[rateLimiter] REDIS_URL not set — per-worker in-memory rate limiting (CLUSTER_WORKERS should stay at 1, per server.js).');
}

async function checkRedisLimit(ip, tier, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `rl:${tier}:${ip}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, windowMs);
  const ttl = await redis.pttl(key);
  return { count, resetMs: ttl > 0 ? ttl : windowMs };
}

function checkMemoryLimit(ip, tier, windowMs) {
  const now = Date.now();
  let data = ipStore.get(ip);
  if (!data) { data = { tiers: {} }; ipStore.set(ip, data); }
  if (!data.tiers[tier]) data.tiers[tier] = { count: 0, windowStart: now };
  const tierData = data.tiers[tier];
  if (now - tierData.windowStart > windowMs) { tierData.count = 0; tierData.windowStart = now; }
  tierData.count++;
  return { count: tierData.count, resetMs: (tierData.windowStart + windowMs) - now };
}

/**
 * Create a rate limiter middleware for a specific tier.
 * @param {'ai'|'places'|'weather'|'general'} tier
 */
function createRateLimiter(tier = 'general') {
  const maxRequests = config.rateLimit[tier] || config.rateLimit.general;
  const windowMs    = config.rateLimit.windowMs;

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    const applyResult = ({ count, resetMs }) => {
      const remaining = Math.max(0, maxRequests - count);
      const resetAt = Math.ceil((Date.now() + resetMs) / 1000);
      res.set('X-RateLimit-Limit',     String(maxRequests));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset',     String(resetAt));

      if (count > maxRequests) {
        const retryAfterSec = Math.ceil(resetMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: 'Too many requests',
          code:  'RATE_LIMIT_EXCEEDED',
          tier,
          limit: maxRequests,
          retryAfterSeconds: retryAfterSec,
        });
      }
      next();
    };

    if (redis) {
      checkRedisLimit(ip, tier, windowMs)
        .then(applyResult)
        .catch((err) => {
          // Expensive tiers: fall back to in-memory per-worker limit (not unlimited).
          // General tier may fail open to preserve availability of health/static-adjacent APIs.
          console.warn('[rateLimiter] Redis check failed, using memory fallback:', err.message);
          if (tier === 'ai' || tier === 'places' || tier === 'timeIntel') {
            applyResult(checkMemoryLimit(ip, tier, windowMs));
          } else {
            next();
          }
        });
    } else {
      applyResult(checkMemoryLimit(ip, tier, windowMs));
    }
  };
}

// Pre-built limiters for convenience
const aiLimiter      = createRateLimiter('ai');
const placesLimiter  = createRateLimiter('places');
const weatherLimiter = createRateLimiter('weather');
const generalLimiter = createRateLimiter('general');
const timeIntelLimiter = createRateLimiter('timeIntel');

module.exports = {
  createRateLimiter,
  aiLimiter,
  placesLimiter,
  weatherLimiter,
  generalLimiter,
  timeIntelLimiter,
};
