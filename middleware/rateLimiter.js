'use strict';
const appLogger = require('../lib/logger');
// Distributed Redis-backed rate limiting with a bounded in-memory fallback.
// Production requires Redis so limits remain consistent across replicas.
const config = require('../config');

const ipStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipStore) {
    for (const [tier, bucket] of Object.entries(data.tiers || {})) {
      if (now - bucket.windowStart > config.rateLimit.windowMs * 2) delete data.tiers[tier];
    }
    if (!Object.keys(data.tiers || {}).length) ipStore.delete(ip);
  }
}, 2 * 60 * 1000).unref();

let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout: 3000,
    });
    redis.on('error', (err) => appLogger.warn('[rateLimiter] Redis error:', err.message));
  } catch (err) {
    appLogger.warn('[rateLimiter] Redis initialization failed:', err.message);
  }
}

function checkMemoryLimit(ip, tier, windowMs) {
  const now = Date.now();
  let data = ipStore.get(ip);
  if (!data) { data = { tiers: {} }; ipStore.set(ip, data); }
  if (!data.tiers[tier]) data.tiers[tier] = { count: 0, windowStart: now };
  const tierData = data.tiers[tier];
  if (now - tierData.windowStart >= windowMs) { tierData.count = 0; tierData.windowStart = now; }
  tierData.count++;
  return { count: tierData.count, resetMs: Math.max(1, tierData.windowStart + windowMs - now) };
}

async function checkRedisLimit(ip, tier, windowMs) {
  if (!redis) throw new Error('Redis unavailable');
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `rl:v2:${tier}:${ip}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, windowMs + 5000);
  const ttl = await redis.pttl(key);
  return { count, resetMs: ttl > 0 ? ttl : windowMs };
}

function createRateLimiter(tier = 'general') {
  const maxRequests = config.rateLimit[tier] || config.rateLimit.general;
  const windowMs = config.rateLimit.windowMs;
  return async (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    try {
      const result = redis
        ? await checkRedisLimit(ip, tier, windowMs)
        : (config.isProd && config.enterprise.requireRedisInProd
          ? Promise.reject(new Error('Redis is required in production for distributed rate limiting'))
          : checkMemoryLimit(ip, tier, windowMs));
      const remaining = Math.max(0, maxRequests - result.count);
      const resetAt = Math.ceil((Date.now() + result.resetMs) / 1000);
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(resetAt));
      if (result.count > maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil(result.resetMs / 1000));
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', tier, limit: maxRequests, retryAfterSeconds: retryAfterSec });
      }
      return next();
    } catch (err) {
      // In production, an unavailable distributed limiter is a security/cost
      // control failure. Do not silently allow unlimited traffic through it.
      if (config.isProd) {
        return res.status(503).json({ error: 'Rate limiting service temporarily unavailable', code: 'RATE_LIMIT_UNAVAILABLE' });
      }
      appLogger.warn('[rateLimiter] Redis unavailable; using local fallback:', err.message);
      const result = checkMemoryLimit(ip, tier, windowMs);
      return result.count > maxRequests
        ? res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', tier, limit: maxRequests })
        : next();
    }
  };
}

module.exports = {
  createRateLimiter,
  aiLimiter: createRateLimiter('ai'),
  placesLimiter: createRateLimiter('places'),
  weatherLimiter: createRateLimiter('weather'),
  generalLimiter: createRateLimiter('general'),
  timeIntelLimiter: createRateLimiter('timeIntel'),
};
