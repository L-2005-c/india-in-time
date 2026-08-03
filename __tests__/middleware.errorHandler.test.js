// Helper to build a minimal mock Express response object.
function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  res.sendFile = jest.fn();
  return res;
}

describe('errorHandler (production mode)', () => {
  let errorHandler;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.GEMINI_API_KEY = 'test-key'; // avoid process.exit(1) in config's requireEnv
    process.env.CORS_ORIGIN = 'https://example.com'; // avoid process.exit(1) in config's CORS guard
    ({ errorHandler } = require('../middleware/errorHandler'));
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.CORS_ORIGIN;
  });

  test('masks internal error details for 5xx responses', () => {
    const err = new Error('Database connection string leaked: postgres://secret');
    err.statusCode = 500;
    const req = { method: 'GET', path: '/api/trips', requestId: 'req-1' };
    const res = mockRes();

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toBe('An unexpected error occurred. Please try again.');
    expect(res.body.stack).toBeUndefined();
  });

  test('preserves the client-facing message for 4xx responses', () => {
    const err = new Error('Missing required field: city');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    const req = { method: 'POST', path: '/api/places', requestId: 'req-2' };
    const res = mockRes();

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toBe('Missing required field: city');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('defaults to 500 when no statusCode is set on the error', () => {
    const err = new Error('boom');
    const req = { method: 'GET', path: '/api/x' };
    const res = mockRes();

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('errorHandler (development mode)', () => {
  let errorHandler;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.GEMINI_API_KEY = 'test-key';
    ({ errorHandler } = require('../middleware/errorHandler'));
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  test('includes a truncated stack trace for debugging', () => {
    const err = new Error('dev error');
    err.statusCode = 500;
    const req = { method: 'GET', path: '/api/dev' };
    const res = mockRes();

    errorHandler(err, req, res, () => {});

    expect(res.body.stack).toBeDefined();
    expect(Array.isArray(res.body.stack)).toBe(true);
    expect(res.body.stack.length).toBeLessThanOrEqual(5);
  });
});

describe('notFoundHandler', () => {
  let notFoundHandler;

  beforeEach(() => {
    jest.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';
    ({ notFoundHandler } = require('../middleware/errorHandler'));
  });

  test('returns JSON 404 for API/JSON requests', () => {
    const req = { headers: { accept: 'application/json' }, originalUrl: '/api/unknown' };
    const res = mockRes();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.path).toBe('/api/unknown');
  });

  test('falls back to serving index.html for HTML navigation requests (SPA)', () => {
    const req = { headers: { accept: 'text/html' }, originalUrl: '/some/client/route' };
    const res = mockRes();

    notFoundHandler(req, res);

    expect(res.sendFile).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('errorHandler — optional error-reporting webhook', () => {
  let errorHandler;
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_URL = process.env.ERROR_REPORTING_WEBHOOK_URL;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.CORS_ORIGIN;
    if (ORIGINAL_URL === undefined) delete process.env.ERROR_REPORTING_WEBHOOK_URL;
    else process.env.ERROR_REPORTING_WEBHOOK_URL = ORIGINAL_URL;
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  test('does nothing (no fetch call) when ERROR_REPORTING_WEBHOOK_URL is unset — matches prior behavior exactly', () => {
    delete process.env.ERROR_REPORTING_WEBHOOK_URL;
    global.fetch = jest.fn();
    ({ errorHandler } = require('../middleware/errorHandler'));

    const err = new Error('boom');
    err.statusCode = 500;
    errorHandler(err, { method: 'GET', path: '/api/x' }, mockRes(), () => {});

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('POSTs a JSON payload to the configured URL for a 5xx error', () => {
    process.env.ERROR_REPORTING_WEBHOOK_URL = 'https://hooks.example.com/errors';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    ({ errorHandler } = require('../middleware/errorHandler'));

    const err = new Error('database exploded');
    err.statusCode = 503;
    errorHandler(err, { method: 'GET', path: '/api/trips', requestId: 'req-9' }, mockRes(), () => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/errors');
    expect(opts.method).toBe('POST');
    const payload = JSON.parse(opts.body);
    expect(payload.error).toBe('database exploded');
    expect(payload.status).toBe(503);
    expect(payload.requestId).toBe('req-9');
    expect(payload.stack).toBeDefined();
  });

  test('does NOT fire the webhook for a 4xx (client) error — only real incidents', () => {
    process.env.ERROR_REPORTING_WEBHOOK_URL = 'https://hooks.example.com/errors';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    ({ errorHandler } = require('../middleware/errorHandler'));

    const err = new Error('bad input');
    err.statusCode = 400;
    errorHandler(err, { method: 'POST', path: '/api/places' }, mockRes(), () => {});

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a failed webhook delivery never throws or blocks the response', async () => {
    process.env.ERROR_REPORTING_WEBHOOK_URL = 'https://hooks.example.com/errors';
    global.fetch = jest.fn().mockRejectedValue(new Error('webhook endpoint unreachable'));
    ({ errorHandler } = require('../middleware/errorHandler'));

    const err = new Error('boom');
    err.statusCode = 500;
    const res = mockRes();

    expect(() => errorHandler(err, { method: 'GET', path: '/api/x' }, res, () => {})).not.toThrow();
    // The HTTP response itself is synchronous and unaffected by the
    // fire-and-forget webhook's eventual failure.
    expect(res.status).toHaveBeenCalledWith(500);

    // Let the rejected promise's .catch() run so it doesn't surface as an
    // unhandled rejection in a later test.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
