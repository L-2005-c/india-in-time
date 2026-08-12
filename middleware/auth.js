// middleware/auth.js — Firebase ID token verification
//
// Your frontend already signs users in with Firebase Google Auth, but the
// backend was never checking the token — every route just trusted whatever
// `userId` string the client sent in the request body/query. That means
// anyone could impersonate anyone else (list/read/delete their trips or
// favorites) just by guessing or copying a userId.
//
// This middleware verifies the Firebase ID token sent as
//   Authorization: Bearer <idToken>
// and sets `req.uid` to the verified, trusted user id. Routes must use
// req.uid — never req.body.userId / req.query.userId — for anything that
// reads or writes a specific user's data.
//
// ── Setup (one-time) ─────────────────────────────────────────────────────────
// 1. Firebase console → Project settings → Service accounts → "Generate new
//    private key". This downloads a JSON file — do NOT commit it.
// 2. On Render: Dashboard → your service → Environment → add a variable
//    named FIREBASE_SERVICE_ACCOUNT whose value is the ENTIRE contents of
//    that JSON file (paste it as-is, Render handles multi-line values fine).
// 3. Redeploy. That's it — no code changes needed after that.

const admin = require('firebase-admin');

let initialized = false;
let initError = null;

function ensureInitialized() {
  if (initialized || initError) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    initError = new Error(
      'FIREBASE_SERVICE_ACCOUNT env var is not set — auth-protected routes will reject all requests. ' +
      'See middleware/auth.js header comment for setup steps.'
    );
    console.error('❌ ', initError.message);
    return;
  }

  try {
    // Accept either raw JSON or base64-encoded JSON (base64 is handy for
    // platforms that mangle newlines in multi-line env vars).
    const looksLikeJson = raw.trim().startsWith('{');
    const jsonStr = looksLikeJson ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(jsonStr);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log('🔐  Firebase Admin initialized — auth verification is active');
  } catch (err) {
    initError = err;
    console.error('❌  Failed to initialize Firebase Admin:', err.message);
  }
}

/**
 * Require a valid Firebase ID token. Sets req.uid and req.userEmail.
 * Responds 401 if missing/invalid, 503 if the server itself isn't configured.
 */
async function requireAuth(req, res, next) {
  ensureInitialized();
  if (!initialized) {
    return res.status(503).json({
      error: 'Server auth is not configured. Set FIREBASE_SERVICE_ACCOUNT in the environment.',
      code: 'AUTH_NOT_CONFIGURED',
    });
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    try { require('../lib/auditLog').writeAudit({ action: 'auth.missing_token', outcome: 'denied', ip: req.ip, requestId: req.requestId }); } catch (_e) {}
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header', code: 'AUTH_REQUIRED' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.uid = decoded.uid;
    req.userEmail = decoded.email || null;
    next();
  } catch (err) {
    console.warn('[auth] token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session — please sign in again.', code: 'AUTH_INVALID' });
  }
}

/**
 * Like requireAuth, but never blocks the request. If a valid Firebase ID
 * token is present, sets req.uid/req.userEmail from it (trusted). If the
 * token is missing, invalid, or auth isn't configured, the request simply
 * continues with req.uid left unset — callers must treat that as anonymous
 * and MUST NOT fall back to a client-supplied userId, or this defeats the
 * point (see routes/feedback.js for the bug this was written to fix: it
 * used to store whatever userId the request body claimed, letting anyone
 * attribute feedback to someone else's account).
 */
async function optionalAuth(req, res, next) {
  ensureInitialized();
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!initialized || !match) {
    return next();
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.uid = decoded.uid;
    req.userEmail = decoded.email || null;
  } catch (err) {
    console.warn('[auth] optional token verification failed (continuing as anonymous):', err.message);
  }
  next();
}

/**
 * Low-level: verify a raw Firebase ID token string and return the decoded
 * token (includes uid, email, and any custom claims like `admin`), or null
 * if Firebase Admin isn't configured. Throws if the token itself is
 * invalid/expired — callers should catch that.
 *
 * Exists so other middleware (see middleware/adminAuth.js's requireAdminAuth)
 * can check custom claims without initializing a second, separate Firebase
 * Admin app instance (calling admin.initializeApp() twice throws).
 */
async function verifyToken(idToken) {
  ensureInitialized();
  if (!initialized) return null;
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { requireAuth, optionalAuth, verifyToken };
