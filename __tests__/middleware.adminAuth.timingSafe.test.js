jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(),
}));

const { verifyToken } = require('../middleware/auth');
const { requireAdminAuth } = require('../middleware/adminAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('admin authentication regression protections', () => {
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id":"test"}';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
  });

  test('legacy x-admin-key can never authenticate a request', async () => {
    const req = { headers: { 'x-admin-key': 'anything' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('Firebase admin authentication remains available', async () => {
    verifyToken.mockResolvedValue({ uid: 'admin', admin: true, role: 'admin' });

    const req = { headers: { authorization: 'Bearer firebase-token' } };
    const res = mockRes();
    const next = jest.fn();

    await requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
