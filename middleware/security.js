// middleware/security.js — Security headers (helmet + CSP config)
// Extracted from server.js so this can be unit-tested in isolation —
// server.js has clustering/DB-init side effects at module load time that
// make it impractical to require() directly in a test.

function buildHelmetOptions() {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' is still required for now — the frontend uses
        // inline onclick= handlers and inline <script> blocks throughout
        // app.js/index.html. Removing this needs the inline-handler cleanup
        // tracked in README.md's "Known gaps" list; until then this at
        // least blocks loading script from any origin NOT listed below.
        scriptSrc: [
          "'self'", "'unsafe-inline'",
          'https://www.googletagmanager.com',
          'https://www.gstatic.com',        // Firebase SDK (ES module imports)
          'https://unpkg.com',              // Leaflet
          'https://cdn.jsdelivr.net',       // DOMPurify
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'", 'data:', 'blob:',
          'https://images.unsplash.com',
          'https://*.basemaps.cartocdn.com', // Leaflet map tiles
        ],
        connectSrc: [
          "'self'",
          'https://identitytoolkit.googleapis.com', // Firebase Auth
          'https://securetoken.googleapis.com',      // Firebase Auth token refresh
          'https://firestore.googleapis.com',        // Firestore
          'https://www.googletagmanager.com',
          'https://*.google-analytics.com',
          'https://*.basemaps.cartocdn.com',
        ],
        frameSrc: ['https://accounts.google.com'], // Firebase Google sign-in
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"], // clickjacking protection
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // disable COOP so Firebase OAuth popups work on mobile
  };
}

/**
 * Returns the helmet middleware, or a no-op passthrough if helmet isn't
 * installed (mirrors the original try/catch fallback behavior in server.js).
 */
function buildSecurityMiddleware() {
  try {
    const helmet = require('helmet');
    return helmet(buildHelmetOptions());
  } catch (_e) {
    console.warn('⚠️  helmet package not installed — skipping security headers');
    return (_req, _res, next) => next();
  }
}

module.exports = { buildHelmetOptions, buildSecurityMiddleware };
