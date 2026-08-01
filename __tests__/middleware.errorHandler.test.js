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
