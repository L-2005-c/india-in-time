// __tests__/middleware.auth.test.js
//
// middleware/auth.js verifies Firebase ID tokens and is the single most
// security-critical file in the app — every route that trusts req.uid
// depends on this working correctly. It previously had ~8% test coverage
// (only exercised indirectly, via middleware/adminAuth's tests mocking it
// away entirely). This suite tests it directly against a mocked
// `firebase-admin`, covering: missing/malformed service-account config,
// both raw-JSON and base64-encoded service-account env values, and the
// success/failure paths of requireAuth / optionalAuth / verifyToken.
//
// The module caches `initialized`/`initError` in closure state across
// calls (by design — admin.initializeApp() must only ever run once), so
// each test that needs a fresh init state uses jest.resetModules() and
// re-requires both the mock and the module under test.

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function freshAuthModule({ initializeAppImpl, verifyIdTokenImpl, certThrows = false } = {}) {
  jest.resetModules();

  const initializeApp = jest.fn(initializeAppImpl || (() => {}));
  const verifyIdToken = jest.fn(verifyIdTokenImpl || (() => Promise.resolve({ uid: 'user-1', email: 'a@b.com' })));
  const cert = jest.fn((sa) => {
    if (certThrows) throw new Error('bad service account');
    return sa;
  });

  jest.doMock('firebase-admin', () => ({
    initializeApp,
    credential: { cert },
    auth: () => ({ verifyIdToken }),
  }));

  const authModule = require('../middleware/auth');
  return { authModule, initializeApp, verifyIdToken, cert };
}

describe('middleware/auth — initialization', () => {
  const ORIGINAL = process.env.FIREBASE_SERVICE_ACCOUNT;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = ORIGINAL;
    jest.clearAllMocks();
  });

  test('requireAuth returns 503 when FIREBASE_SERVICE_ACCOUNT is not set', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const { authModule } = freshAuthModule();
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_NOT_CONFIGURED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('requireAuth returns 503 when FIREBASE_SERVICE_ACCOUNT is malformed JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = '{not valid json';
    const { authModule, initializeApp } = freshAuthModule();
    const req = { headers: { authorization: 'Bearer sometoken' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(initializeApp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a base64-encoded service account (not just raw JSON)', async () => {
    const sa = { project_id: 'demo', client_email: 'x@y.iam.gserviceaccount.com', private_key: 'pk' };
    process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify(sa)).toString('base64');
    const { authModule, initializeApp, cert } = freshAuthModule();
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(cert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'demo' }));
    expect(next).toHaveBeenCalled();
    expect(req.uid).toBe('user-1');
  });

  test('accepts a raw-JSON service account', async () => {
    const sa = { project_id: 'demo2', client_email: 'x@y.iam.gserviceaccount.com', private_key: 'pk' };
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(sa);
    const { authModule, initializeApp } = freshAuthModule();
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
  });

  test('surfaces a 503 (not a crash) if admin.credential.cert() throws', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo3' });
    const { authModule } = freshAuthModule({ certThrows: true });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('only calls admin.initializeApp() once across multiple requests', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo4' });
    const { authModule, initializeApp } = freshAuthModule();
    const res1 = mockRes();
    const res2 = mockRes();
    await authModule.requireAuth({ headers: { authorization: 'Bearer t1' } }, res1, jest.fn());
    await authModule.requireAuth({ headers: { authorization: 'Bearer t2' } }, res2, jest.fn());

    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
});

describe('middleware/auth — requireAuth token handling', () => {
  const ORIGINAL = process.env.FIREBASE_SERVICE_ACCOUNT;
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = ORIGINAL;
    jest.clearAllMocks();
  });

  test('returns 401 when the Authorization header is missing', async () => {
    const { authModule } = freshAuthModule();
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when the header is not a Bearer token', async () => {
    const { authModule } = freshAuthModule();
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('sets req.uid/req.userEmail and calls next() on a valid token', async () => {
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.resolve({ uid: 'abc123', email: 'user@example.com' }),
    });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(req.uid).toBe('abc123');
    expect(req.userEmail).toBe('user@example.com');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('defaults req.userEmail to null when the token has no email claim', async () => {
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.resolve({ uid: 'abc123' }),
    });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(req.userEmail).toBeNull();
  });

  test('returns 401 when Firebase rejects the token (expired/invalid)', async () => {
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.reject(new Error('Firebase ID token has expired')),
    });
    const req = { headers: { authorization: 'Bearer expired-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_INVALID' }));
    expect(next).not.toHaveBeenCalled();
    expect(req.uid).toBeUndefined();
  });

  test('is case-insensitive on the "Bearer" scheme', async () => {
    const { authModule } = freshAuthModule();
    const req = { headers: { authorization: 'bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('middleware/auth — optionalAuth', () => {
  const ORIGINAL = process.env.FIREBASE_SERVICE_ACCOUNT;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = ORIGINAL;
    jest.clearAllMocks();
  });

  test('continues as anonymous (no req.uid) when auth is not configured at all', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const { authModule } = freshAuthModule();
    const req = { headers: { authorization: 'Bearer whatever' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.optionalAuth(req, res, next);

    expect(req.uid).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('continues as anonymous when no Authorization header is present', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
    const { authModule } = freshAuthModule();
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authModule.optionalAuth(req, res, next);

    expect(req.uid).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test('sets req.uid when a valid token is present', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.resolve({ uid: 'opt-user', email: 'opt@example.com' }),
    });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.optionalAuth(req, res, next);

    expect(req.uid).toBe('opt-user');
    expect(next).toHaveBeenCalled();
  });

  test('does NOT block the request when the token is invalid — continues anonymous', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.reject(new Error('invalid token')),
    });
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authModule.optionalAuth(req, res, next);

    expect(req.uid).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('middleware/auth — verifyToken (low-level helper used by adminAuth)', () => {
  const ORIGINAL = process.env.FIREBASE_SERVICE_ACCOUNT;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = ORIGINAL;
    jest.clearAllMocks();
  });

  test('returns null when Firebase Admin is not configured', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const { authModule } = freshAuthModule();

    const result = await authModule.verifyToken('some-token');

    expect(result).toBeNull();
  });

  test('returns the decoded token (including custom claims) on success', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.resolve({ uid: 'admin-1', email: 'admin@example.com', admin: true }),
    });

    const result = await authModule.verifyToken('admin-token');

    expect(result).toEqual(expect.objectContaining({ uid: 'admin-1', admin: true }));
  });

  test('propagates rejection when the token itself is invalid (caller must catch)', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo' });
    const { authModule } = freshAuthModule({
      verifyIdTokenImpl: () => Promise.reject(new Error('invalid signature')),
    });

    await expect(authModule.verifyToken('bad-token')).rejects.toThrow('invalid signature');
  });
});
