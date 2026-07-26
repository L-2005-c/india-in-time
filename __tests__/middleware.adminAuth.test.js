const { requireAdminKey } = require('../middleware/adminAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireAdminKey', () => {
  const ORIGINAL_KEY = process.env.ADMIN_FEEDBACK_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_FEEDBACK_KEY;
    else process.env.ADMIN_FEEDBACK_KEY = ORIGINAL_KEY;
  });

  test('returns 503 when ADMIN_FEEDBACK_KEY is not configured on the server', () => {
    delete process.env.ADMIN_FEEDBACK_KEY;
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAdminKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when the provided key does not match', () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'wrong-secret' } };
    const res = mockRes();
    const next = jest.fn();

    requireAdminKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when no key header is provided at all', () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAdminKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('calls next() when the correct key is provided', () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    requireAdminKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // Regression test: query-string ?key= support was deliberately removed
  // (see middleware/adminAuth.js header comment — secrets in URLs leak via
  // access logs/browser history/proxies). Make sure it stays removed.
  test('does NOT accept the key via query string', () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: {}, query: { key: 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    requireAdminKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
