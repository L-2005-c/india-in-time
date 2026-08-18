// __tests__/middleware.rateLimiter.redis.test.js
// The Redis-backed branch of middleware/rateLimiter.js previously had 0%
// test coverage — only __tests__/middleware.rateLimiter.test.js's in-memory
// fallback path was tested. `redis` is decided once at module load time
// based on process.env.REDIS_URL, so REDIS_URL must be set *before* the
// module is first required in this file.
//
// Honest scope note: this cannot validate real distributed behavior across
// multiple worker processes/machines under load — that needs an actual
// Redis instance and concurrent traffic, neither of which is available in
// this environment. What it does verify: the increment/expire/window-reset
// logic against a mocked Redis client is correct, and that a Redis error
// fails OPEN (allows the request through) rather than taking the API down,
// exactly as the module's own header comment promises.

process.env.REDIS_URL = 'redis://localhost:6379';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

const mockRedisInstance = {
  incr: jest.fn(),
  pexpire: jest.fn(),
  pttl: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => jest.fn(() => mockRedisInstance));

const { createRateLimiter } = require('../middleware/rateLimiter');

// Captured immediately after require, before any beforeEach clears mocks —
// these calls happen once at module load time, not per-request.
const onCallsAtModuleLoad = mockRedisInstance.on.mock.calls.map(c => c[0]);

function mockReqRes(ip = '1.2.3.4') {
  const req = { ip, connection: {} };
  const headers = {};
  const res = {
    set: jest.fn((k, v) => { headers[k] = v; }),
    status: jest.fn(function (code) { this.statusCode = code; return this; }),
    json: jest.fn(function (body) { this.body = body; return this; }),
    headers,
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rateLimiter — Redis-backed path', () => {
  test('registers connect/error handlers on the shared Redis client at module load', () => {
    // Confirms the module actually wired up the client rather than silently
    // no-op-ing when REDIS_URL is set.
    expect(onCallsAtModuleLoad).toContain('error');
    expect(onCallsAtModuleLoad).toContain('connect');
  });

  test('allows the request and sets rate-limit headers on a normal (under-limit) count', async () => {
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.pexpire.mockResolvedValue(1);
    mockRedisInstance.pttl.mockResolvedValue(60000);

    const limiter = createRateLimiter('general');
    const { req, res } = mockReqRes();
    const next = jest.fn();
    limiter(req, res, next);
    await new Promise(setImmediate); // flush the promise chain inside the middleware

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
  });

  test('only calls pexpire on the FIRST request in a window (count === 1), not on every request', async () => {
    mockRedisInstance.incr.mockResolvedValue(5); // not the first request
    mockRedisInstance.pttl.mockResolvedValue(30000);

    const limiter = createRateLimiter('general');
    const { req, res } = mockReqRes();
    limiter(req, res, jest.fn());
    await new Promise(setImmediate);

    expect(mockRedisInstance.pexpire).not.toHaveBeenCalled();
  });

  test('returns 429 once the shared Redis counter exceeds the tier limit', async () => {
    // config.rateLimit.ai's default limit — use a count comfortably over any
    // plausible configured limit to avoid coupling this test to the exact
    // configured number.
    mockRedisInstance.incr.mockResolvedValue(999999);
    mockRedisInstance.pttl.mockResolvedValue(15000);

    const limiter = createRateLimiter('ai');
    const { req, res } = mockReqRes();
    const next = jest.fn();
    limiter(req, res, next);
    await new Promise(setImmediate);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(next).not.toHaveBeenCalled();
    expect(res.headers['Retry-After']).toBeDefined();
  });

  test('fails OPEN (allows the request) when Redis itself errors, per the module\'s documented behavior', async () => {
    mockRedisInstance.incr.mockRejectedValue(new Error('ECONNREFUSED'));

    const limiter = createRateLimiter('general');
    const { req, res } = mockReqRes();
    const next = jest.fn();
    limiter(req, res, next);
    await new Promise(setImmediate);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('scopes the Redis key per-tier, so an AI-tier count does not affect a places-tier count for the same IP', async () => {
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.pexpire.mockResolvedValue(1);
    mockRedisInstance.pttl.mockResolvedValue(60000);

    const aiLimiter = createRateLimiter('ai');
    const placesLimiter = createRateLimiter('places');
    const { req: req1, res: res1 } = mockReqRes('9.9.9.9');
    const { req: req2, res: res2 } = mockReqRes('9.9.9.9');

    aiLimiter(req1, res1, jest.fn());
    placesLimiter(req2, res2, jest.fn());
    await new Promise(setImmediate);

    const keysUsed = mockRedisInstance.incr.mock.calls.map(c => c[0]);
    expect(keysUsed[0]).toContain(':ai:');
    expect(keysUsed[1]).toContain(':places:');
    expect(keysUsed[0]).not.toBe(keysUsed[1]);
  });
});
