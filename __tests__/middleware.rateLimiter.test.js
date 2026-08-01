// Tests the in-memory (no REDIS_URL) rate limiting path — the default mode
// server.js runs in, and the one middleware/rateLimiter.js's own comments
// say must behave correctly since it's what keeps CLUSTER_WORKERS=1 safe.

function mockRes() {
  const res = {};
  res.headers = {};
  res.statusCode = null;
  res.body = null;
  res.set = jest.fn((key, val) => { res.headers[key] = val; });
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

describe('createRateLimiter (in-memory / no Redis)', () => {
  let createRateLimiter;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.REDIS_URL; // force in-memory path
    process.env.RATE_LIMIT_GENERAL = '3'; // small limit, fast to test against
    process.env.GEMINI_API_KEY = 'test-key';
    ({ createRateLimiter } = require('../middleware/rateLimiter'));
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_GENERAL;
  });

  test('allows requests under the limit', () => {
    const limiter = createRateLimiter('general');
    const req = { ip: '1.2.3.4' };
    const next = jest.fn();

    limiter(req, mockRes(), next);
    limiter(req, mockRes(), next);
    limiter(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('blocks requests once the limit is exceeded, with a 429', () => {
    const limiter = createRateLimiter('general');
    const req = { ip: '5.6.7.8' };
    const next = jest.fn();
    let lastRes;

    for (let i = 0; i < 4; i++) {
      lastRes = mockRes();
      limiter(req, lastRes, next);
    }

    expect(next).toHaveBeenCalledTimes(3); // first 3 pass
    expect(lastRes.status).toHaveBeenCalledWith(429);
    expect(lastRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('tracks separate IPs independently', () => {
    const limiter = createRateLimiter('general');
    const next = jest.fn();

    // Exhaust the limit for IP A
    for (let i = 0; i < 3; i++) limiter({ ip: 'ip-a' }, mockRes(), next);
    // IP B should be unaffected
    const resB = mockRes();
    limiter({ ip: 'ip-b' }, resB, next);

    expect(next).toHaveBeenCalledTimes(4); // 3 for A + 1 for B
    expect(resB.status).not.toHaveBeenCalled();
  });

  // Regression test: this is the exact bug class documented in server.js —
  // each tier (ai/places/weather/general) must keep its own independent
  // counter per IP, not share one bucket, or the "strictest" AI limiter
  // would be silently loosened by traffic on other endpoints.
  test('keeps separate tiers isolated from each other for the same IP', () => {
    process.env.RATE_LIMIT_AI = '1';
    jest.resetModules();
    delete process.env.REDIS_URL;
    const { createRateLimiter: freshCreateRateLimiter } = require('../middleware/rateLimiter');

    const aiLimiter = freshCreateRateLimiter('ai');
    const generalLimiter = freshCreateRateLimiter('general');
    const req = { ip: 'shared-ip' };
    const next = jest.fn();

    aiLimiter(req, mockRes(), next); // uses up the 1-request AI budget
    const aiBlockedRes = mockRes();
    aiLimiter(req, aiBlockedRes, next); // should now be blocked

    const generalRes = mockRes();
    generalLimiter(req, generalRes, next); // general tier should still work

    expect(aiBlockedRes.status).toHaveBeenCalledWith(429);
    expect(generalRes.status).not.toHaveBeenCalled();

    delete process.env.RATE_LIMIT_AI;
  });

  test('sets rate limit response headers', () => {
    const limiter = createRateLimiter('general');
    const res = mockRes();
    limiter({ ip: '9.9.9.9' }, res, jest.fn());

    expect(res.headers['X-RateLimit-Limit']).toBe('3');
    expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
    expect(res.headers['X-RateLimit-Reset']).toBeDefined();
  });

  test('falls back to "unknown" IP key without throwing when req.ip is missing', () => {
    const limiter = createRateLimiter('general');
    const next = jest.fn();
    expect(() => limiter({}, mockRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
