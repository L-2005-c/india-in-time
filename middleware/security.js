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
          'https://apis.google.com',        // Firebase Auth's Google sign-in loads apis.google.com/js/api.js
          'https://unpkg.com',              // Leaflet
          'https://cdn.jsdelivr.net',       // DOMPurify
        ],
        // IMPORTANT: helmet's own built-in defaults set script-src-attr and
        // style-src-attr to 'none' and do NOT inherit scriptSrc/styleSrc's
        // 'unsafe-inline' — these are separate CSP directives specifically
        // for inline event-handler attributes (onclick=, onkeydown=, etc.)
        // and inline style="" attributes. Omitting these left script-src-attr
        // at helmet's default of 'none', which silently blocked every single
        // onclick=/onkeydown= handler in the app — i.e. every button on the
        // page stopped working. Must be set explicitly.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'", "'unsafe-inline'",
          'https://fonts.googleapis.com', 'https://unpkg.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'", 'data:', 'blob:',
          'https://images.unsplash.com',
          'https://*.basemaps.cartocdn.com', // Leaflet map tiles
          'https://*.googleusercontent.com', // Google/Firebase Auth profile photos (lh3/lh4/lh5...)
        ],
        connectSrc: [
          "'self'",
          'https://identitytoolkit.googleapis.com', // Firebase Auth
          'https://securetoken.googleapis.com',      // Firebase Auth token refresh
          'https://firestore.googleapis.com',        // Firestore
          'https://apis.google.com',                 // Firebase Auth's gapi loader (loaded via script-src above) calls back to this
          'https://www.googletagmanager.com',
          'https://*.google-analytics.com',
          'https://*.basemaps.cartocdn.com',
          'https://cdn.jsdelivr.net',                // DOMPurify's sourcemap fetch (devtools only, but blocked otherwise)
          'https://www.gstatic.com',                 // Firebase SDK's sourcemap fetch (devtools only, but blocked otherwise)
          'https://routing.openstreetmap.de',        // OSRM road-routing API — draws the actual road-following route line
        ],
        frameSrc: [
          'https://accounts.google.com',
          'https://apis.google.com',
          // The Firebase Auth popup flow loads this app's own authDomain
          // handler page first (india-in-time.firebaseapp.com/__/auth/handler),
          // which then talks to accounts.google.com — without this, the
          // handler page itself gets blocked from framing at all, the popup
          // can never complete, and Firebase surfaces that back to the user
          // as "auth/cancelled-popup-request".
          'https://india-in-time.firebaseapp.com',
        ], // Firebase Google sign-in
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
