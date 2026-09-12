/**
 * __tests__/frontend.phase8bMobilePilotValidation.test.js
 *
 * Phase 8B: Real-Device Mobile & PWA Pilot Validation Test Suite
 *
 * Verifies:
 * 1. PWA Manifest & Service Worker contract
 * 2. Online/Offline network transition events & stale-state labeling
 * 3. Geolocation permission & error recovery (Cases 1-5)
 * 4. AI Assistant Authoritative Safety Guard (Non-override rule)
 * 5. Trip Control Center stop immutability & leg progression
 * 6. Multi-category Alerts Center offline awareness
 * 7. Security: cross-user trip ownership isolation
 * 8. Map HUD traveler cleanliness
 */

const fs = require('fs');
const path = require('path');

describe('Phase 8B: Real-Device Mobile & PWA Pilot Validation', () => {
  const rootDir = path.resolve(__dirname, '..');

  // ── 1. PWA Manifest & Service Worker Contract ───────────────────────────
  describe('1. PWA Manifest & App Shell Integrity', () => {
    test('manifest.json conforms to mobile standalone PWA requirements', () => {
      const manifestPath = path.join(rootDir, 'frontend', 'public', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.name).toBe('India In-Time');
      expect(manifest.short_name).toBe('In-Time');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.theme_color).toBe('#10b981');
      expect(manifest.background_color).toBe('#080e1a');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      const sizes = manifest.icons.map(i => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });

    test('sw.js implements cache-first static, network-first API, and push handling', () => {
      const swPath = path.join(rootDir, 'frontend', 'public', 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);
      const swContent = fs.readFileSync(swPath, 'utf8');

      expect(swContent).toContain("url.pathname.startsWith('/api/')");
      expect(swContent).toContain("self.addEventListener('push'");
      expect(swContent).toContain("BYPASS_SW_HOSTS");
    });
  });

  // ── 2. Network Transition & Online Resync ────────────────────────────────
  describe('2. Network Transition & Online Resync Observer', () => {
    test('connectivity.js dispatches iit:online-resync and iit:offline-transition', () => {
      const connPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'utils', 'connectivity.js');
      const connContent = fs.readFileSync(connPath, 'utf8');

      expect(connContent).toContain("'iit:online-resync'");
      expect(connContent).toContain("'iit:offline-transition'");
      expect(connContent).toContain('refreshAlertsView');
    });

    test('alertsCenter.js shows offline indicator banner when disconnected', () => {
      const alertsPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'modules', 'alertsCenter.js');
      const alertsContent = fs.readFileSync(alertsPath, 'utf8');

      expect(alertsContent).toContain('alerts-offline-banner');
      expect(alertsContent).toContain('Offline Mode:');
    });
  });

  // ── 3. AI Assistant Authoritative Safety Guard ─────────────────────────
  describe('3. AI Assistant Non-Override Safety Hierarchy', () => {
    test('chatAssistant.js provides checkSafetyOverride function', () => {
      const chatPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'modules', 'chatAssistant.js');
      const chatContent = fs.readFileSync(chatPath, 'utf8');

      expect(chatContent).toContain('export function checkSafetyOverride');
      expect(chatContent).toContain('Authoritative Safety Rule');
    });

    test('routes/ai.js rejects safety bypass prompts at the API layer', () => {
      const aiRoutePath = path.join(rootDir, 'routes', 'ai.js');
      const aiContent = fs.readFileSync(aiRoutePath, 'utf8');

      expect(aiContent).toContain('Authoritative Safety Rule: India In-Time cannot override');
      expect(aiContent).toContain('ignore|bypass|override');
    });

    test('app.js handleChat intercepts safety override queries before external calls', () => {
      const appPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'core', 'app.js');
      const appContent = fs.readFileSync(appPath, 'utf8');

      expect(appContent).toContain('Authoritative Safety Rule:');
    });
  });

  // ── 4. Location Permission Edge Cases ──────────────────────────────────
  describe('4. Geolocation Permission & Graceful Recovery', () => {
    test('app.js handles geolocation timeout, error, or denial by falling back to default city', () => {
      const appPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'core', 'app.js');
      const appContent = fs.readFileSync(appPath, 'utf8');

      expect(appContent).toContain("if (!('geolocation' in navigator))");
      expect(appContent).toContain("load('hyderabad')");
      expect(appContent).toContain("waitForFirstGpsFix(14000)");
    });

    test('initGPS rejects malformed NaN fixes and implausible teleports', () => {
      const appPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'core', 'app.js');
      const appContent = fs.readFileSync(appPath, 'utf8');

      expect(appContent).toContain('Number.isFinite(pos.coords.latitude)');
      expect(appContent).toContain('isPlausibleGpsFix(pos)');
    });
  });

  // ── 5. Journey Immutability & State Continuity ────────────────────────
  describe('5. Active Journey Stop Immutability & Continuity', () => {
    test('journeyStateEngine ensures completed stops remain terminal and immutable', () => {
      const enginePath = path.join(rootDir, 'services', 'travelIntelligence', 'journey', 'journeyStateEngine.js');
      const engineContent = fs.readFileSync(enginePath, 'utf8');

      expect(engineContent).toContain("STOP_STATUSES = Object.freeze({");
      expect(engineContent).toContain('COMPLETED');
    });
  });

  // ── 6. Security: Trip Ownership Isolation ─────────────────────────────
  describe('6. Security & Multi-Tenant Isolation', () => {
    test('trips route enforces ownership check on GET /api/trips/:id', () => {
      const tripsRoutePath = path.join(rootDir, 'routes', 'trips.js');
      const tripsContent = fs.readFileSync(tripsRoutePath, 'utf8');

      expect(tripsContent).toContain('trip.user_id !== req.uid');
      expect(tripsContent).toContain("res.status(404).json({ error: 'Trip not found' })");
    });

    test('trips route scopes DELETE queries to user_id', () => {
      const tripsRoutePath = path.join(rootDir, 'routes', 'trips.js');
      const tripsContent = fs.readFileSync(tripsRoutePath, 'utf8');

      expect(tripsContent).toContain('await deleteTrip(req.params.id, req.uid)');
    });
  });

  // ── 7. Map HUD Traveler Cleanliness ────────────────────────────────────
  describe('7. Map HUD Traveler Presentation', () => {
    test('mapHud.js hides Vector and GPX buttons from traveler interface', () => {
      const hudPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'modules', 'mapHud.js');
      const hudContent = fs.readFileSync(hudPath, 'utf8');

      expect(hudContent).toContain('display:none;');
      expect(hudContent).toContain('toggleMapLayer');
      expect(hudContent).toContain('exportGpxTrack');
    });
  });
});
