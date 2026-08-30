'use strict';

/**
 * Firebase-backed administrator authorization.
 *
 * Administrative access is intentionally attributable to an individual
 * Firebase user. Shared admin secrets are not supported by the application
 * runtime. Grant the required custom claims through Firebase Admin SDK.
 */
const { verifyToken } = require('./auth');
const logger = require('../lib/logger');

function getAdminWhitelist() {
  return new Set(
    process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      : []
  );
}

async function tryFirebaseAdminAuth(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return false;

  try {
    const decoded = await verifyToken(match[1]);
    const email = (decoded?.email || '').toLowerCase().trim();
    const whitelist = getAdminWhitelist();
    const isClaimAdmin = decoded?.admin === true;
    const isWhitelisted = email && whitelist.has(email);

    if (decoded && (isClaimAdmin || isWhitelisted)) {
      req.uid = decoded.uid;
      req.adminEmail = email || null;
      // Whitelist admins default to lowest privilege ('analytics') unless claim specifies higher role
      req.adminRole = decoded.role || (isClaimAdmin ? 'owner' : 'analytics');
      req.adminAuthMethod = isClaimAdmin ? 'firebase-claim' : 'admin-whitelist';
      return true;
    }

    if (decoded) {
      logger.warn(
        { uid: decoded.uid, email: decoded.email },
        '[adminAuth] valid Firebase token but missing admin custom claim or email whitelist — denying'
      );
    }
  } catch (err) {
    logger.warn(
      { err: err.message },
      '[adminAuth] Firebase token verification failed'
    );
  }

  return false;
}

async function requireAdminAuth(req, res, next) {
  if (await tryFirebaseAdminAuth(req)) return next();

  const firebaseConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!firebaseConfigured) {
    return res.status(503).json({
      error: 'Admin access is not configured. Grant a Firebase admin custom claim.',
      code: 'ADMIN_AUTH_NOT_CONFIGURED',
    });
  }

  return res.status(401).json({
    error: 'Invalid or missing admin credentials',
    code: 'ADMIN_AUTH_REQUIRED',
  });
}

function requireAdminRole(...allowedRoles) {
  return async (req, res, next) => {
    await requireAdminAuth(req, res, () => {
      const role = req.adminRole || 'admin';
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: 'Insufficient administrator role',
          code: 'ADMIN_ROLE_FORBIDDEN',
        });
      }
      return next();
    });
  };
}

module.exports = { requireAdminAuth, requireAdminRole };
