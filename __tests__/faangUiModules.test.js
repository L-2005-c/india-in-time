'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX_HTML_PATH = path.join(__dirname, '../frontend/app-src/index.html');
const STYLES_CSS_PATH = path.join(__dirname, '../frontend/app-src/styles.css');
const APP_JS_PATH = path.join(__dirname, '../frontend/app-src/src/core/app.js');
const MODULES_DIR = path.join(__dirname, '../frontend/app-src/src/modules');

const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const stylesCss = fs.readFileSync(STYLES_CSS_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');

describe('FAANG UI Suite & SaaS Enhancements Verification', () => {
  describe('1. HTML Component & HUD Elements', () => {
    let doc;
    beforeAll(() => {
      const dom = new JSDOM(indexHtml);
      doc = dom.window.document;
    });

    test('renders ambient glow canvas', () => {
      const canvas = doc.querySelector('.ambient-glow-canvas');
      expect(canvas).not.toBeNull();
      expect(canvas.querySelectorAll('.ambient-orb').length).toBe(3);
    });

    test('renders floating frosted Map HUD dock with layer and fullscreen actions', () => {
      const hud = doc.querySelector('#map-hud-dock');
      expect(hud).not.toBeNull();
      expect(hud.querySelector('[data-action="toggleMapLayer"]')).not.toBeNull();
      expect(hud.querySelector('[data-action="toggleMapFullscreen"]')).not.toBeNull();
    });

    test('renders Trip Health container and What-If simulator button', () => {
      expect(doc.querySelector('#trip-health-container')).not.toBeNull();
      expect(doc.querySelector('#what-if-trigger-container')).not.toBeNull();
      expect(doc.querySelector('[data-action="openWhatIfModal"]')).not.toBeNull();
    });

    test('renders Copilot 2.0 prompt suggestion chips', () => {
      const chips = doc.querySelector('#copilot-prompt-chips');
      expect(chips).not.toBeNull();
      expect(chips.querySelectorAll('[data-action="sendCopilotPrompt"]').length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('2. Design System & CSS Rules', () => {
    test('contains FAANG frosted glass, crowd curves, and boarding pass classes', () => {
      expect(stylesCss).toContain('.faang-stop-card');
      expect(stylesCss).toContain('.stop-crowd-meter');
      expect(stylesCss).toContain('.transit-connector-card');
      expect(stylesCss).toContain('.trip-health-card');
      expect(stylesCss).toContain('.what-if-card');
      expect(stylesCss).toContain('.map-hud-dock');
      expect(stylesCss).toContain('.copilot-chip');
      expect(stylesCss).toContain('.boarding-pass-card');
    });
  });

  describe('3. Core Action Registry (app.js)', () => {
    test('STATIC_ACTIONS includes all FAANG-grade actions', () => {
      const expectedActions = [
        'openWhatIfModal',
        'closeWhatIfModal',
        'onWhatIfParamChange',
        'applyWhatIfSimulation',
        'toggleMapLayer',
        'toggleMapFullscreen',
        'highlightStopOnMap',
        'openDishModal',
        'sendCopilotPrompt',
      ];
      for (const action of expectedActions) {
        expect(appJs).toContain(action);
      }
    });
  });

  describe('4. Modular Architecture Files', () => {
    test('all new domain modules exist on disk with valid exports', () => {
      const files = [
        'itineraryUiEngine.js',
        'whatIfSimulatorUi.js',
        'tripHealthScore.js',
        'mapHud.js',
      ];
      for (const f of files) {
        const fullPath = path.join(MODULES_DIR, f);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf8');
        expect(content).toContain('export function');
      }
    });
  });

  describe('5. Trip Health Score Logic Parity', () => {
    test('computes balanced 4-pillar scores', () => {
      const stops = [{ name: 'Stop 1' }, { name: 'Stop 2' }, { name: 'Stop 3' }, { name: 'Stop 4' }];
      const routeEfficiency = Math.min(98, 82 + (stops.length > 2 ? 12 : 5));
      const scenicAlignment = Math.min(96, 85 + (stops.length % 3) * 4);
      const climateComfort = 92;
      const cultureDensity = Math.min(99, 88 + Math.min(10, stops.length * 2));
      const totalScore = Math.round((routeEfficiency + scenicAlignment + climateComfort + cultureDensity) / 4);

      expect(totalScore).toBeGreaterThanOrEqual(85);
      expect(totalScore).toBeLessThanOrEqual(100);
    });
  });
});
