// __tests__/middleware.adminAuth.timingSafe.test.js — Regression tests for
// the constant-time legacy-key comparison added to middleware/adminAuth.js
// (previously a plain `!==`, which leaks match-length via timing). These
// focus on *correctness* of the comparison, not timing itself — timing
// side-channels aren't practically assertable in a unit test, but a broken
// implementation of "safe" comparison (e.g. one that throws or misbehaves
// on mismatched lengths) would be just as bad as no protection at all, so
// this locks in that every case still resolves to the right true/false.

jest.mock('../middleware/auth', () => ({
  verifyToken: jest.fn(),
}));

const { requireAdminAuth } = require('../middleware/adminAuth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

async function tryKey(configuredKey, providedKey) {
  process.env.ADMIN_FEEDBACK_KEY = configuredKey;
  const req = { headers: providedKey === undefined ? {} : { 'x-admin-key': providedKey } };
  const res = mockRes();
  const next = jest.fn();
  await requireAdminAuth(req, res, next);
  return { req, res, next };
}

describe('requireAdminAuth — timing-safe key comparison correctness', () => {
  const ORIGINAL_KEY = process.env.ADMIN_FEEDBACK_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_FEEDBACK_KEY;
    else process.env.ADMIN_FEEDBACK_KEY = ORIGINAL_KEY;
    jest.clearAllMocks();
  });

  test('accepts an exact match', async () => {
    const { next, res } = await tryKey('super-secret-key', 'super-secret-key');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects a key that is shorter than the configured one', async () => {
    const { next, res } = await tryKey('super-secret-key', 'super-secret');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects a key that is longer than the configured one', async () => {
    const { next, res } = await tryKey('short', 'short-but-with-extra-stuff-appended');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects an empty provided key against a non-empty configured key', async () => {
    const { next, res } = await tryKey('super-secret-key', '');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects when no key header is provided at all', async () => {
    const { next, res } = await tryKey('super-secret-key', undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('is case-sensitive (no accidental normalization)', async () => {
    const { next, res } = await tryKey('Super-Secret-Key', 'super-secret-key');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('handles unicode keys correctly (multi-byte characters)', async () => {
    const key = 'सुरक्षित-कुंजी-🔑';
    const { next } = await tryKey(key, key);
    expect(next).toHaveBeenCalled();
  });

  test('rejects a near-miss that differs only in the last character', async () => {
    const { next, res } = await tryKey('super-secret-key', 'super-secret-kez');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects a near-miss that differs only in the first character', async () => {
    const { next, res } = await tryKey('super-secret-key', 'zuper-secret-key');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
