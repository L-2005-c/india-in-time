// middleware/rateLimiter.js — Per-IP sliding window rate limiting
// No Redis needed — in-memory with automatic cleanup.

const config = require('../config');

// Store: IP → { count, windowStart, tier counts }
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

/**
 * Create a rate limiter middleware for a specific tier.
 * @param {'ai'|'places'|'weather'|'general'} tier
 */
function createRateLimiter(tier = 'general') {
  const maxRequests = config.rateLimit[tier] || config.rateLimit.general;
  const windowMs    = config.rateLimit.windowMs;

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const tierKey = `${tier}`;

    let data = ipStore.get(ip);
    if (!data) {
      data = { tiers: {} };
      ipStore.set(ip, data);
    }

    if (!data.tiers[tierKey]) {
      data.tiers[tierKey] = { count: 0, windowStart: now };
    }

    const tierData = data.tiers[tierKey];

    // Reset window if expired
    if (now - tierData.windowStart > windowMs) {
      tierData.count = 0;
      tierData.windowStart = now;
    }

    tierData.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - tierData.count);
    const resetAt   = Math.ceil((tierData.windowStart + windowMs) / 1000);
    res.set('X-RateLimit-Limit',     String(maxRequests));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset',     String(resetAt));

    if (tierData.count > maxRequests) {
      const retryAfterSec = Math.ceil((tierData.windowStart + windowMs - now) / 1000);
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
}

// Pre-built limiters for convenience
const aiLimiter      = createRateLimiter('ai');
const placesLimiter  = createRateLimiter('places');
const weatherLimiter = createRateLimiter('weather');
const generalLimiter = createRateLimiter('general');

module.exports = {
  createRateLimiter,
  aiLimiter,
  placesLimiter,
  weatherLimiter,
  generalLimiter,
};
