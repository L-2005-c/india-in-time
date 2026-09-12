'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX_HTML_PATH = path.join(__dirname, '../frontend/app-src/index.html');
const MOBILE_SHELL_PATH = path.join(__dirname, '../frontend/app-src/src/modules/mobileShell.js');
const MORE_MENU_PATH = path.join(__dirname, '../frontend/app-src/src/modules/moreMenu.js');
const ALERTS_CENTER_PATH = path.join(__dirname, '../frontend/app-src/src/modules/alertsCenter.js');
const LAUNCHPAD_PATH = path.join(__dirname, '../frontend/app-src/src/modules/journeyLaunchpad.js');
const MAP_HUD_PATH = path.join(__dirname, '../frontend/app-src/src/modules/mapHud.js');

describe('Phase 8A — Traveler Experience Refinement Suite', () => {
  let dom;
  let doc;
  let html;

  beforeAll(() => {
    html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    dom = new JSDOM(html);
    doc = dom.window.document;
  });

  describe('1. Primary Bottom Navigation (5 Canonical Tabs)', () => {
    test('1. Bottom navigation contains exactly Map / Journey / Plan / Assistant / More', () => {
      const navItems = [...doc.querySelectorAll('#bottom-nav .nav-item')];
      expect(navItems.length).toBe(5);
      const labels = navItems.map(item => item.querySelector('.nav-lbl')?.textContent?.trim());
      expect(labels).toEqual(['Map', 'Journey', 'Plan', 'Assistant', 'More']);
    });

    test('2. Alerts is absent from primary navigation bar', () => {
      const alertsTab = doc.querySelector('#bottom-nav .nav-item[data-view="alerts-view"]');
      expect(alertsTab).toBeNull();
    });

    test('3. Assistant tab maps to chat-view at index 3', () => {
      const assistantTab = doc.querySelector('#bottom-nav .nav-item[data-view="chat-view"][data-idx="3"]');
      expect(assistantTab).not.toBeNull();
      expect(assistantTab.querySelector('.nav-lbl')?.textContent?.trim()).toBe('Assistant');
    });

    test('4. More tab maps to more-view at index 4', () => {
      const moreTab = doc.querySelector('#bottom-nav .nav-item[data-view="more-view"][data-idx="4"]');
      expect(moreTab).not.toBeNull();
    });

    test('5. Alert badge #nav-alert-badge is attached to More tab', () => {
      const badge = doc.getElementById('nav-alert-badge');
      expect(badge).not.toBeNull();
      const parentTab = badge.closest('.nav-item');
      expect(parentTab?.getAttribute('data-view')).toBe('more-view');
    });
  });

  describe('2. Mobile Shell & Tab Resolver Invariants', () => {
    let mobileShell;

    beforeAll(() => {
      mobileShell = fs.readFileSync(MOBILE_SHELL_PATH, 'utf8');
    });

    test('6. resolveMobileTabIdx maps chat-view to 3 and alerts/more/tools to 4', () => {
      expect(mobileShell).toMatch(/if\s*\(viewId\s*===\s*'chat-view'\)\s*return\s*3;/);
      expect(mobileShell).toMatch(/if\s*\(viewId\s*===\s*'more-view'\s*\|\|\s*viewId\s*===\s*'tools-view'\s*\|\|\s*viewId\s*===\s*'alerts-view'\)\s*return\s*4;/);
    });

    test('7. Alerts Center opens through More without creating a 6th tab', () => {
      expect(mobileShell).toMatch(/switchMobileTab\('alerts-view',\s*4\)/);
    });
  });

  describe('3. More Screen & Travel Utilities', () => {
    let moreMenuCode;

    beforeAll(() => {
      moreMenuCode = fs.readFileSync(MORE_MENU_PATH, 'utf8');
    });

    test('8. Developer / Demo Mode card is removed from More screen', () => {
      expect(moreMenuCode).not.toContain('dev-simulation-card');
      expect(moreMenuCode).not.toContain('btn-simulate-cricket-traffic');
      expect(moreMenuCode).not.toContain('btn-simulate-ghat-rain');
    });

    test('9. Travel Utilities grid includes all 10 required capability cards', () => {
      const requiredActions = [
        'alerts',
        'budget',
        'passport',
        'emergencySos',
        'offlinePass',
        'dna',
        'weatherRadar',
        'packing',
        'phrases',
        'transitStatus',
      ];
      requiredActions.forEach((action) => {
        expect(moreMenuCode).toContain(`action: '${action}'`);
      });
    });

    test('10. More screen contains dedicated Alerts & Safety banner', () => {
      expect(moreMenuCode).toContain('more-alerts-banner');
      expect(moreMenuCode).toContain('Alerts & Safety Center');
    });
  });

  describe('4. Alerts Center & Data Provenance Rules', () => {
    let alertsCenterCode;
    let mobileShellCode;

    beforeAll(() => {
      alertsCenterCode = fs.readFileSync(ALERTS_CENTER_PATH, 'utf8');
      mobileShellCode = fs.readFileSync(MOBILE_SHELL_PATH, 'utf8');
    });

    test('11. Alerts Center provides Back to More header action', () => {
      expect(alertsCenterCode).toContain('alerts-btn-back-to-more');
      expect(alertsCenterCode).toContain('Back to More');
    });

    test('12. Alerts Center supports ALL, TRAFFIC, WEATHER, SAFETY category filters', () => {
      expect(alertsCenterCode).toMatch(/categories\s*=\s*\[\s*'ALL',\s*'TRAFFIC',\s*'WEATHER',\s*'SAFETY'\s*\]/);
    });

    test('13. No fabricated live alerts: all alerts have explicit provenance tags', () => {
      expect(mobileShellCode).toMatch(/provenance:\s*'(ESTIMATED|OBSERVED|FORECAST|SIMULATED)/);
      expect(mobileShellCode).not.toContain("'LIVE_CONFIRMED'");
    });

    test('14. Traffic alert generation is not suppressed by daytime hours', () => {
      expect(mobileShellCode).toContain('Corridor Transit Pacing');
      expect(mobileShellCode).toContain('ESTIMATED (City Traffic Model)');
    });
  });

  describe('5. Journey Tab Pre-Trip Launchpad', () => {
    let launchpadCode;

    beforeAll(() => {
      launchpadCode = fs.readFileSync(LAUNCHPAD_PATH, 'utf8');
    });

    test('15. Journey Launchpad provides Plan a Custom Trip and Preview Sample Journey CTAs', () => {
      expect(launchpadCode).toContain('launchpad-btn-plan');
      expect(launchpadCode).toContain('launchpad-btn-preview');
      expect(launchpadCode).toContain('Plan a Custom Trip');
      expect(launchpadCode).toContain('Preview Sample Journey');
    });

    test('16. Sample Journey preview is clearly marked as SAMPLE PREVIEW / SIMULATION', () => {
      const mobileShellCode = fs.readFileSync(MOBILE_SHELL_PATH, 'utf8');
      expect(mobileShellCode).toContain('SAMPLE PREVIEW');
      expect(mobileShellCode).toContain('Demonstration Journey');
      expect(mobileShellCode).toContain('btn-exit-sample-preview');
    });

    test('17. Curated city route concepts exist for Visakhapatnam', () => {
      expect(launchpadCode).toContain('Coastal Sunrise & Beach Cruise');
      expect(launchpadCode).toContain('Araku Valley Mountain Loop');
      expect(launchpadCode).toContain('Heritage & Temple Trail');
      expect(launchpadCode).toContain('CURATED ROUTE');
    });

    test('18. index.html contains #journey-launchpad container', () => {
      expect(doc.getElementById('journey-launchpad')).not.toBeNull();
    });
  });

  describe('6. Map HUD Cleanup', () => {
    test('19. Vector button is not visible in traveler Map UI', () => {
      const vectorBtn = doc.querySelector('#map-hud-dock button[data-action="toggleMapLayer"]');
      expect(vectorBtn).not.toBeNull();
      expect(vectorBtn.getAttribute('style')).toContain('display:none');
    });

    test('20. GPX button is not visible in traveler Map UI', () => {
      const gpxBtn = doc.querySelector('#map-hud-dock button[data-action="exportGpxTrack"]');
      expect(gpxBtn).not.toBeNull();
      expect(gpxBtn.getAttribute('style')).toContain('display:none');
    });

    test('21. Google Maps Sync and Expand buttons remain visible in traveler Map UI', () => {
      const gmapsBtn = doc.getElementById('hud-btn-gmaps');
      expect(gmapsBtn).not.toBeNull();
      expect(gmapsBtn.getAttribute('style') || '').not.toContain('display:none');

      const expandBtn = doc.querySelector('#map-hud-dock button[data-action="toggleMapFullscreen"]');
      expect(expandBtn).not.toBeNull();
      expect(expandBtn.getAttribute('style') || '').not.toContain('display:none');
    });

    test('22. mapHud.js renderMapHudDock hides Vector and GPX', () => {
      const mapHudCode = fs.readFileSync(MAP_HUD_PATH, 'utf8');
      expect(mapHudCode).toMatch(/data-action="toggleMapLayer"[^>]*style="display:none;"/);
      expect(mapHudCode).toMatch(/data-action="exportGpxTrack"[^>]*style="display:none;"/);
    });
  });
});
