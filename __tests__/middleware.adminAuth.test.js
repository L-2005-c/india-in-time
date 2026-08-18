jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const { verifyToken } = require('../middleware/auth');
const { requireAdminAuth, requireAdminRole } = require('../middleware/adminAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireAdminAuth — Firebase-only administrator authentication', () => {
  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    jest.clearAllMocks();
  });

  test('returns 503 when Firebase admin authentication is not configured', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when Firebase is configured but credentials are missing', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects legacy x-admin-key even in test environments', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    const req = { headers: { 'x-admin-key': 'legacy-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a verified Firebase admin token', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    verifyToken.mockResolvedValue({
      uid: 'admin-uid',
      email: 'admin@example.com',
      admin: true,
      role: 'owner',
    });

    const req = { headers: { authorization: 'Bearer verified-token' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.uid).toBe('admin-uid');
    expect(req.adminEmail).toBe('admin@example.com');
    expect(req.adminRole).toBe('owner');
    expect(req.adminAuthMethod).toBe('firebase-claim');
  });

  test('rejects a valid Firebase token without the admin claim', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    verifyToken.mockResolvedValue({
      uid: 'user-uid',
      email: 'user@example.com',
      admin: false,
    });

    const req = { headers: { authorization: 'Bearer user-token' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('enforces roles through requireAdminRole', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    verifyToken.mockResolvedValue({
      uid: 'analytics-uid',
      email: 'analytics@example.com',
      admin: true,
      role: 'analytics',
    });

    const req = { headers: { authorization: 'Bearer analytics-token' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminRole('analytics')(req, res, next);
    expect(next).toHaveBeenCalled();

    jest.clearAllMocks();
    await requireAdminRole('owner')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
