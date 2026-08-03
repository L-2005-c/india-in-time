jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(),
}));
jest.mock('../lib/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const { verifyToken } = require('../middleware/auth');
const logger = require('../lib/logger');
const { requireAdminAuth, requireAdminKey } = require('../middleware/adminAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireAdminAuth — legacy shared-key path', () => {
  const ORIGINAL_KEY = process.env.ADMIN_FEEDBACK_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_FEEDBACK_KEY;
    else process.env.ADMIN_FEEDBACK_KEY = ORIGINAL_KEY;
    jest.clearAllMocks();
  });

  test('returns 503 when neither Firebase nor the shared key is configured', async () => {
    delete process.env.ADMIN_FEEDBACK_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when the provided key does not match', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'wrong-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() and tags the request when the correct key is provided', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminAuthMethod).toBe('legacy-shared-key');
  });

  test('logs a deprecation warning (with the endpoint) every time the legacy key path succeeds, so usage is visible before removal', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = {
      headers: { 'x-admin-key': 'correct-secret' },
      originalUrl: '/api/analytics/summary?hours=24',
      method: 'GET',
    };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/analytics/summary?hours=24', method: 'GET' }),
      expect.stringContaining('DEPRECATED')
    );
  });

  test('does NOT log the deprecation warning on a failed legacy-key attempt (nothing succeeded to deprecate)', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'wrong-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('DEPRECATED')
    );
  });

  test('ADMIN_LEGACY_KEY_DISABLED=true rejects a correct key — a real kill switch, not just observability', async () => {
    const ORIGINAL_DISABLED = process.env.ADMIN_LEGACY_KEY_DISABLED;
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    process.env.ADMIN_LEGACY_KEY_DISABLED = 'true';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('DEPRECATED')
    );

    if (ORIGINAL_DISABLED === undefined) delete process.env.ADMIN_LEGACY_KEY_DISABLED;
    else process.env.ADMIN_LEGACY_KEY_DISABLED = ORIGINAL_DISABLED;
  });

  test('any value other than the literal string "true" leaves the legacy path enabled (fails safe/open toward the existing behavior, not silently locking admins out on a typo)', async () => {
    const ORIGINAL_DISABLED = process.env.ADMIN_LEGACY_KEY_DISABLED;
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    process.env.ADMIN_LEGACY_KEY_DISABLED = 'yes'; // not the exact string 'true'
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();

    if (ORIGINAL_DISABLED === undefined) delete process.env.ADMIN_LEGACY_KEY_DISABLED;
    else process.env.ADMIN_LEGACY_KEY_DISABLED = ORIGINAL_DISABLED;
  });

  test('ADMIN_LEGACY_KEY_EXPIRES in the past rejects a correct key — a deadline, not just a manual switch', async () => {
    const ORIGINAL_EXPIRES = process.env.ADMIN_LEGACY_KEY_EXPIRES;
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    process.env.ADMIN_LEGACY_KEY_EXPIRES = '2020-01-01';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: expect.any(String) }),
      expect.stringContaining('ADMIN_LEGACY_KEY_EXPIRES has passed')
    );

    if (ORIGINAL_EXPIRES === undefined) delete process.env.ADMIN_LEGACY_KEY_EXPIRES;
    else process.env.ADMIN_LEGACY_KEY_EXPIRES = ORIGINAL_EXPIRES;
  });

  test('ADMIN_LEGACY_KEY_EXPIRES in the future still allows a correct key', async () => {
    const ORIGINAL_EXPIRES = process.env.ADMIN_LEGACY_KEY_EXPIRES;
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    process.env.ADMIN_LEGACY_KEY_EXPIRES = '2099-01-01';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();

    if (ORIGINAL_EXPIRES === undefined) delete process.env.ADMIN_LEGACY_KEY_EXPIRES;
    else process.env.ADMIN_LEGACY_KEY_EXPIRES = ORIGINAL_EXPIRES;
  });

  test('an unparseable ADMIN_LEGACY_KEY_EXPIRES is ignored (fails safe/open, not a silent lockout on a typo)', async () => {
    const ORIGINAL_EXPIRES = process.env.ADMIN_LEGACY_KEY_EXPIRES;
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    process.env.ADMIN_LEGACY_KEY_EXPIRES = 'not-a-real-date';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();

    if (ORIGINAL_EXPIRES === undefined) delete process.env.ADMIN_LEGACY_KEY_EXPIRES;
    else process.env.ADMIN_LEGACY_KEY_EXPIRES = ORIGINAL_EXPIRES;
  });

  // Regression test: query-string ?key= support was deliberately removed
  // (secrets in URLs leak via access logs/browser history/proxies).
  test('does NOT accept the key via query string', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: {}, query: { key: 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('requireAdminKey is a backward-compatible alias for requireAdminAuth', () => {
    expect(requireAdminKey).toBe(requireAdminAuth);
  });
});

describe('requireAdminAuth — Firebase custom-claim path', () => {
  const ORIGINAL_KEY = process.env.ADMIN_FEEDBACK_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_FEEDBACK_KEY;
    else process.env.ADMIN_FEEDBACK_KEY = ORIGINAL_KEY;
    jest.clearAllMocks();
  });

  test('grants access and attributes the request to a real uid when the token has admin:true', async () => {
    verifyToken.mockResolvedValue({ uid: 'admin-user-1', email: 'admin@example.com', admin: true });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.uid).toBe('admin-user-1');
    expect(req.adminEmail).toBe('admin@example.com');
    expect(req.adminAuthMethod).toBe('firebase-claim');
  });

  test('denies a valid Firebase token that lacks the admin custom claim', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'some-key'; // configured, but not provided in this request
    verifyToken.mockResolvedValue({ uid: 'regular-user', email: 'user@example.com' }); // no admin: true
    const req = { headers: { authorization: 'Bearer valid-but-not-admin' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('falls through to the legacy key check if the Firebase token is invalid', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    verifyToken.mockRejectedValue(new Error('token expired'));
    const req = {
      headers: { authorization: 'Bearer expired-token', 'x-admin-key': 'correct-secret' },
    };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminAuthMethod).toBe('legacy-shared-key');
  });

  test('does not attempt Firebase verification when no Authorization header is present', async () => {
    process.env.ADMIN_FEEDBACK_KEY = 'correct-secret';
    const req = { headers: { 'x-admin-key': 'correct-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(verifyToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
