'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');
const express = require('express');
const advisoryEngine = require('../services/travelIntelligence/advisoryEngine');
const trafficEngine = require('../services/travelIntelligence/trafficEngine');
const timeIntelligenceRouter = require('../routes/time-intelligence');

// Load frontend offlineTravelPass module into VM sandbox to support ES module syntax
const OFFLINE_PASS_PATH = path.join(__dirname, '../frontend/app-src/src/modules/offlineTravelPass.js');
const offlinePassSource = fs.readFileSync(OFFLINE_PASS_PATH, 'utf8');
const cjsCode = offlinePassSource
  .replace(/export const /g, 'const ')
  .replace(/export function /g, 'function ')
  + '\nmodule.exports = { resolveRegionKey, EMERGENCY_DIRECTORIES, buildOfflineTravelPassHtml, generateWhatsAppShareText };';
const passSandbox = { module: { exports: {} }, exports: {}, Date };
vm.runInNewContext(cjsCode, passSandbox);
const { resolveRegionKey, EMERGENCY_DIRECTORIES, buildOfflineTravelPassHtml, generateWhatsAppShareText } = passSandbox.module.exports;

const CIRCUIT_UI_PATH = path.join(__dirname, '../frontend/app-src/src/modules/circuitPlannerUi.js');
const ITINERARY_UI_PATH = path.join(__dirname, '../frontend/app-src/src/modules/itineraryUiEngine.js');
const STYLES_CSS_PATH = path.join(__dirname, '../frontend/app-src/styles.css');

describe('Pillars A, B, C Advancements Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/time-intelligence', timeIntelligenceRouter);
  });

  describe('Pillar A: Multi-Day Regional Circuit API & UI Wiring', () => {
    test('POST /api/time-intelligence/circuit-plan generates a valid 3-day circuit', async () => {
      const res = await request(app)
        .post('/api/time-intelligence/circuit-plan')
        .send({
          circuitId: 'vizag_araku_lambasingi',
          days: 3,
          pace: 'moderate',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.circuit).toBeDefined();
      expect(res.body.circuit.id).toBe('vizag_araku_lambasingi');
      expect(Array.isArray(res.body.days)).toBe(true);
      expect(res.body.days.length).toBe(3);

      const day1 = res.body.days[0];
      expect(day1.day).toBe(1);
      expect(day1.title).toMatch(/Coastal & Urban Gateway/i);
      expect(Array.isArray(day1.itinerary)).toBe(true);
      expect(day1.itinerary.length).toBeGreaterThan(0);

      const day2 = res.body.days[1];
      expect(day2.day).toBe(2);
      expect(day2.title).toMatch(/Highland Coffee & Tribal Valleys/i);

      const day3 = res.body.days[2];
      expect(day3.day).toBe(3);
      expect(day3.title).toMatch(/Misty Cloud Valleys & Highlands/i);
    });

    test('POST /api/time-intelligence/circuit-plan clamps day count to available circuit days', async () => {
      const res = await request(app)
        .post('/api/time-intelligence/circuit-plan')
        .send({
          circuitId: 'vizag_araku_lambasingi',
          days: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.days.length).toBe(3);
    }, 15000);

    test('POST /api/time-intelligence/circuit-plan falls back gracefully on unknown circuit', async () => {
      const res = await request(app)
        .post('/api/time-intelligence/circuit-plan')
        .send({
          circuitId: 'non_existent_circuit',
          days: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.circuit.id).toBe('vizag_araku_lambasingi');
    }, 15000);

    test('circuitPlannerUi.js orchestrates multi-day plans, day tabs, and API calls', () => {
      const circuitUiCode = fs.readFileSync(CIRCUIT_UI_PATH, 'utf8');
      expect(circuitUiCode).toContain('timeIntelligenceCircuitPlan');
      expect(circuitUiCode).toContain('executeRegionalCircuit');
      expect(circuitUiCode).toContain('updateDayTabs');
      expect(circuitUiCode).toContain('loadPlan');
    });
  });

  describe('Pillar B: Vistadome Scenic Rail & Inter-District Gateway Transit', () => {
    test('recommendTransitMode recommends Vistadome Rail for Vizag to Araku / Borra corridor', () => {
      const recommendation = trafficEngine.recommendTransitMode(
        { name: 'Visakhapatnam Railway Station' },
        { name: 'Araku Valley Tribal Museum' },
        { isVistadome: true }
      );

      expect(recommendation.recommendedMode).toBe('vistadome_rail');
      expect(recommendation.modeIcon).toBe('🚆');
      expect(recommendation.modeLabel).toContain('Vistadome Scenic Rail');
      expect(recommendation.corridorTag).toContain('Train 18551/18552');
      expect(recommendation.scenicFeatures).toContain('58 tunnels');
      expect(recommendation.bookingTip).toContain('Advance IRCTC Vistadome booking essential');
    });

    test('recommendTransitMode detects Vistadome by destination keywords', () => {
      const rec = trafficEngine.recommendTransitMode(
        { name: 'Vizag Port' },
        { name: 'Borra Caves Glass Bridge' }
      );

      expect(rec.recommendedMode).toBe('vistadome_rail');
      expect(rec.modeLabel).toContain('Vistadome');
    });

    test('recommendTransitMode recommends Pilgrim Express for Chennai to Tirupati corridor', () => {
      const rec = trafficEngine.recommendTransitMode(
        { name: 'Chennai Central' },
        { name: 'Tirupati Balaji Temple' },
        { corridor: 'chennai_tirupati' }
      );

      expect(rec.recommendedMode).toBe('pilgrim_express');
      expect(rec.modeIcon).toBe('🚆');
      expect(rec.modeLabel).toContain('Interstate Pilgrim Express');
      expect(rec.bookingTip).toContain('TTD Special Entry');
    });

    test('recommendTransitMode preserves regular road transit for ordinary routes', () => {
      const rec = trafficEngine.recommendTransitMode(
        { name: 'R.K. Beach' },
        { name: 'Kailasagiri' }
      );

      expect(rec.recommendedMode).toBe('cab');
    });

    test('itineraryUiEngine.js & styles.css support Vistadome and Pilgrim Express badges', () => {
      const uiEngineSource = fs.readFileSync(ITINERARY_UI_PATH, 'utf8');
      expect(uiEngineSource).toContain('chip-vistadome-rail');
      expect(uiEngineSource).toContain('chip-pilgrim-express');

      const styles = fs.readFileSync(STYLES_CSS_PATH, 'utf8');
      expect(styles).toContain('.chip-vistadome-rail');
      expect(styles).toContain('.chip-pilgrim-express');
      expect(styles).toContain('.circuit-btn');
    });
  });

  describe('Pillar C: Highland Monsoon Landslide Warnings & Advisory Engine', () => {
    test('getGhatHazardAdvisory flags CRITICAL severity for heavy rain on ghat roads', () => {
      const advisory = advisoryEngine.getGhatHazardAdvisory(
        { name: 'Lambasingi Ghat Pass', lat: 17.8, lng: 82.5 },
        { precipitation: 25, condition: 'Heavy torrential downpour' },
        720
      );

      expect(advisory.isGhat).toBe(true);
      expect(advisory.hasHazard).toBe(true);
      expect(advisory.severity).toBe('CRITICAL');
      expect(advisory.alerts.some(a => a.includes('Monsoon Hazard') || a.includes('rockfall'))).toBe(true);
      expect(advisory.guidance.some(g => g.includes('ITDA') || g.includes('Highway Police'))).toBe(true);
    });

    test('getGhatHazardAdvisory flags ADVISORY severity for night mountain travel and dense fog', () => {
      const advisory = advisoryEngine.getGhatHazardAdvisory(
        { name: 'Paderu Ghat' },
        { precipitation: 0, condition: 'Clear' },
        1260 // 21:00 (9 PM)
      );

      expect(advisory.isGhat).toBe(true);
      expect(advisory.hasHazard).toBe(true);
      expect(advisory.severity).toBe('ADVISORY');
      expect(advisory.alerts.some(a => a.includes('Dense Ghat Fog') || a.includes('Curfew'))).toBe(true);
    });

    test('getGhatHazardAdvisory returns NORMAL for non-ghat coastal/plain locations', () => {
      const advisory = advisoryEngine.getGhatHazardAdvisory(
        { name: 'Hyderabad Charminar' },
        { precipitation: 2, condition: 'Light drizzle' },
        600
      );

      expect(advisory.isGhat).toBe(false);
      expect(advisory.hasHazard).toBe(false);
      expect(advisory.severity).toBe('NORMAL');
    });

    test('dynamicAdvice embeds ghat hazard warnings seamlessly', () => {
      const advice = advisoryEngine.dynamicAdvice({
        name: 'Araku Valley Chaparai Rapids',
        isOpenNow: true,
        visitScore: 85,
        weather: { precipitation: 30, condition: 'Heavy Rain' },
        minuteOfDay: 650,
      });

      expect(advice.ghatHazard).toBeDefined();
      expect(advice.ghatHazard.hasHazard).toBe(true);
      expect(advice.actions[0]).toMatch(/Monsoon Hazard/i);
    });
  });

  describe('Pillar C: Regional Emergency Armor in Offline Travel Pass', () => {
    test('resolveRegionKey correctly classifies regional districts', () => {
      expect(resolveRegionKey('Paderu Agency', 'paderu')).toBe('alluri_paderu');
      expect(resolveRegionKey('Araku Valley', 'araku')).toBe('alluri_paderu');
      expect(resolveRegionKey('Lambasingi', 'lambasingi')).toBe('alluri_paderu');
      expect(resolveRegionKey('Tirupati Town', 'tirupati')).toBe('tirupati');
      expect(resolveRegionKey('Visakhapatnam Port', 'visakhapatnam')).toBe('visakhapatnam');
      expect(resolveRegionKey('Bengaluru City', 'bangalore')).toBeNull();
    });

    test('EMERGENCY_DIRECTORIES contains authoritative contacts', () => {
      const alluri = EMERGENCY_DIRECTORIES.alluri_paderu;
      expect(alluri).toBeDefined();
      const itda = alluri.find(c => c.title.includes('ITDA Control Room'));
      expect(itda).toBeDefined();
      expect(itda.num).toBe('08935-250022');

      const tirupati = EMERGENCY_DIRECTORIES.tirupati;
      expect(tirupati).toBeDefined();
      const ttd = tirupati.find(c => c.title.includes('TTD Vigilance'));
      expect(ttd).toBeDefined();
      expect(ttd.num).toBe('1800-425-4141');

      const vizag = EMERGENCY_DIRECTORIES.visakhapatnam;
      expect(vizag).toBeDefined();
      const marine = vizag.find(c => c.title.includes('Marine Police'));
      expect(marine).toBeDefined();
      expect(marine.num).toBe('0891-2565454');
    });

    test('buildOfflineTravelPassHtml renders regional emergency armor for Alluri / Paderu', () => {
      const mockPlan = [[
        { name: 'Vanjangi Clouds Peak', arriveAt: '05:30', leaveAt: '07:30', vt: 120, cat: 'scenic' }
      ]];
      const html = buildOfflineTravelPassHtml(mockPlan, 'Paderu Agency', 0, 'paderu');
      expect(html).toContain('Regional Emergency Armor: Alluri Sitharama Raju / Paderu / Araku');
      expect(html).toContain('08935-250022');
      expect(html).toContain('ITDA Control Room');
    });

    test('buildOfflineTravelPassHtml renders regional emergency armor for Tirupati', () => {
      const mockPlan = [[
        { name: 'Sri Venkateswara Temple', arriveAt: '07:00', leaveAt: '10:00', vt: 180, cat: 'temple' }
      ]];
      const html = buildOfflineTravelPassHtml(mockPlan, 'Tirupati', 0, 'tirupati');
      expect(html).toContain('Regional Emergency Armor: Tirupati & Tirumala Pilgrim Security');
      expect(html).toContain('1800-425-4141');
      expect(html).toContain('TTD Vigilance');
    });

    test('generateWhatsAppShareText appends regional emergency armor when applicable', () => {
      const mockPlan = [[
        { name: 'R.K. Beach', sts: '06:00', ets: '07:30', vt: 90, cat: 'beach' }
      ]];
      const shareText = generateWhatsAppShareText(mockPlan, 'Visakhapatnam', 0, 'visakhapatnam');
      expect(shareText).toContain('REGIONAL EMERGENCY ARMOR (VISAKHAPATNAM COASTAL & MARINE)');
      expect(shareText).toContain('0891-2565454');
      expect(shareText).toContain('Vizag Marine Police / Beach Patrol');
      expect(shareText).toContain('Police/Emergency: 112');
    });
  });
});
