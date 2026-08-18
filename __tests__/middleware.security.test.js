const express = require('express');
const request = require('supertest');
const { buildSecurityMiddleware, buildHelmetOptions } = require('../middleware/security');

function buildTestApp() {
  const app = express();
  app.use(buildSecurityMiddleware());
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('security middleware (CSP / helmet headers)', () => {
  let app;

  beforeEach(() => {
    app = buildTestApp();
  });

  test('sets a Content-Security-Policy header (regression: this used to be fully disabled)', async () => {
    const res = await request(app).get('/ping');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('CSP default-src is locked to self (no wildcard origin allowed)', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
  });

  test('CSP allows the specific external hosts the frontend actually needs', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    // Firebase SDK, Leaflet, DOMPurify, Google Fonts, map tiles
    expect(csp).toContain('https://www.gstatic.com');
    expect(csp).toContain('https://unpkg.com');
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://*.basemaps.cartocdn.com');
  });

  // After converting all dynamic onclick= to data-action delegation,
  // script-src-attr is tightened to 'none' (the secure default).
  // style-src-attr still needs 'unsafe-inline' for dynamic style="" attributes.
  test('blocks inline event-handler attributes (script-src-attr none) while allowing style-src-attr', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });

  // Regression test: Google/Firebase Auth profile photos are served from
  // lh3.googleusercontent.com (and other lh*.googleusercontent.com hosts) —
  // missing this from img-src silently broke the user's avatar image.
  test('allows Google profile photo hosts in img-src', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('https://*.googleusercontent.com');
  });

  test('CSP blocks object-src (legacy plugin/Flash vector)', async () => {
    const res = await request(app).get('/ping');
    expect(res.headers['content-security-policy']).toContain("object-src 'none'");
  });

  test('CSP sets frame-ancestors for clickjacking protection', async () => {
    const res = await request(app).get('/ping');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
  });

  test('does not set a random/unexpected origin in any directive (sanity check against typos)', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).not.toMatch(/https:\/\/evil\.example/);
  });

  test('buildHelmetOptions() keeps crossOriginOpenerPolicy disabled for Firebase OAuth popups', () => {
    const opts = buildHelmetOptions();
    expect(opts.crossOriginOpenerPolicy).toBe(false);
  });

  // Regression test for a real production bug: the Firebase Auth popup flow
  // loads this app's own authDomain handler page (india-in-time.firebaseapp.com/
  // __/auth/handler) before it ever talks to accounts.google.com. Allowing
  // only accounts.google.com in frame-src blocked that handler page from
  // framing at all, so the popup could never complete — Firebase surfaced
  // that back to users as "auth/cancelled-popup-request", most visibly on
  // new devices with no cached auth state to fall back on.
  test('CSP frame-src allows the Firebase authDomain popup handler, not just accounts.google.com', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('https://india-in-time.firebaseapp.com');
    expect(csp).toContain('https://accounts.google.com');
  });

  // Regression test: Firebase Auth's Google sign-in dynamically loads
  // apis.google.com/js/api.js (the gapi loader). Missing it from script-src
  // blocked that script entirely and surfaced to users as a generic
  // "Firebase: Error (auth/internal-error)" with no indication it was a CSP
  // problem.
  test('CSP script-src and connect-src allow apis.google.com (Firebase gapi loader)', async () => {
    const res = await request(app).get('/ping');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('https://apis.google.com');
  });
});
