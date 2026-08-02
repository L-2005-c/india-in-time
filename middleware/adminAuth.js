// middleware/adminAuth.js — Gate for internal/admin-only endpoints.
//
// Two ways to authenticate as an admin, checked in order:
//
//   1. Firebase ID token with an `admin: true` custom claim
//      (Authorization: Bearer <idToken>). This is the preferred path —
//      it ties every admin request to a real, individually-attributable
//      user (req.uid/req.adminEmail), so "who did this" is answerable
//      from logs instead of "someone who had the key". Grant the claim
//      via Firebase Admin SDK, e.g.:
//        admin.auth().setCustomUserClaims(uid, { admin: true });
//
//   2. The legacy shared secret (x-admin-key header, matched against
//      ADMIN_FEEDBACK_KEY). Kept for backward compatibility with any
//      existing tooling/dashboard using it (see frontend/public/
//      admin-feedback.html) — but every admin action authenticated this
//      way is indistinguishable from any other holder of the key. Prefer
//      migrating callers to (1) over time; see README.md's "Known gaps".
//
// Query-string (?key=) support was deliberately never re-added — secrets
// in URLs get logged (server access logs, browser history, proxies).

const crypto = require('crypto');
const { verifyToken } = require('./auth');
const logger = require('../lib/logger');

/**
 * Constant-time string comparison. A plain `a !== b` on a secret returns as
 * soon as it hits the first mismatched byte, which leaks (via response
 * timing, over enough attempts) how many leading characters of a guess were
 * correct — the classic timing side-channel that motivates using this for
 * any secret compared against attacker-controlled input, like the
 * x-admin-key header below.
 */
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  // timingSafeEqual throws on length mismatch rather than returning false,
  // and comparing lengths first would itself leak length via timing — so
  // compare against a fixed-length digest of each side instead of the raw
  // (variable-length) secret.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

async function tryFirebaseAdminAuth(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return false;

  try {
    const decoded = await verifyToken(match[1]);
    if (decoded && decoded.admin === true) {
      req.uid = decoded.uid;
      req.adminEmail = decoded.email || null;
      req.adminAuthMethod = 'firebase-claim';
      return true;
    }
    if (decoded) {
      logger.warn({ uid: decoded.uid }, '[adminAuth] valid Firebase token but missing admin custom claim — denying');
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[adminAuth] Firebase token verification failed');
  }
  return false;
}

function tryLegacyKeyAuth(req) {
  const configured = process.env.ADMIN_FEEDBACK_KEY;
  if (!configured) return false;
  const provided = req.headers['x-admin-key'];
  if (!provided || !timingSafeStringEqual(provided, configured)) return false;
  req.adminAuthMethod = 'legacy-shared-key';
  // Deprecation observability: this path is unattributable (anyone with the
  // key looks identical in logs), and the goal is to eventually retire it in
  // favor of Firebase admin claims (see the file header comment). Without
  // visibility into *actual* usage, "eventually" never happens — this gives
  // operators something to grep for to see which callers still depend on it
  // before removing it out from under them.
  logger.warn(
    { path: req.originalUrl || req.path, method: req.method },
    '[adminAuth] DEPRECATED: request authenticated via legacy shared key, not a Firebase admin claim — see middleware/adminAuth.js header comment for the migration path'
  );
  return true;
}

/**
 * Require admin access via either Firebase custom claim or the legacy
 * shared key. Sets req.adminAuthMethod so downstream handlers/logs can
 * tell which path was used.
 */
async function requireAdminAuth(req, res, next) {
  if (await tryFirebaseAdminAuth(req)) return next();
  if (tryLegacyKeyAuth(req)) return next();

  const firebaseConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const keyConfigured = !!process.env.ADMIN_FEEDBACK_KEY;
  if (!firebaseConfigured && !keyConfigured) {
    return res.status(503).json({
      error: 'Admin access is not configured. Set ADMIN_FEEDBACK_KEY and/or grant a Firebase admin custom claim.',
    });
  }
  return res.status(401).json({ error: 'Invalid or missing admin credentials' });
}

// Backward-compatible alias — existing route files import { requireAdminKey }.
// requireAdminAuth is a strict superset (still accepts the same key), so
// this is a safe drop-in; new code should prefer requireAdminAuth directly.
module.exports = { requireAdminAuth, requireAdminKey: requireAdminAuth };
