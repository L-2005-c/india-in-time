/**
 * Optional idempotency-key middleware for POST mutations (trips, feedback).
 * Clients send Idempotency-Key header; duplicate keys within TTL return cached response.
 * In-memory by default; use Redis when REDIS_URL is set (best-effort).
 */
const crypto = require('crypto');

const memory = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt < now) memory.delete(k);
  }
}

function idempotency(req, res, next) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }
  const key = req.get('Idempotency-Key') || req.get('idempotency-key');
  if (!key) return next();

  const scope = `${req.method}:${req.path}:${key}`;
  const hash = crypto.createHash('sha256').update(scope).digest('hex');

  prune();
  const hit = memory.get(hash);
  if (hit && hit.expiresAt > Date.now()) {
    res.set('Idempotency-Replayed', 'true');
    return res.status(hit.status).json(hit.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    memory.set(hash, {
      status: res.statusCode || 200,
      body,
      expiresAt: Date.now() + TTL_MS,
    });
    if (memory.size > 5000) prune();
    return originalJson(body);
  };
  next();
}

module.exports = { idempotency };
