'use strict';

/**
 * __tests__/safety.providerSmoke.test.js
 *
 * India In-Time v3.0 — Safety Provider Operational Smoke & Health Tests
 *
 * Fast unit/integration test suite running in CI.
 * Mocks external network calls to run in milliseconds with 100% reliability,
 * validating schema normalization, provider health reporting, and error degradation.
 *
 * Note: Real unmocked HTTP requests are tested via scripts/live-safety-provider-smoke.js.
 */

const https = require('https');
const { EventEmitter } = require('events');
const {
  getSafetyProviders,
  fetchNdmaAlerts,
  fetchImdWarnings,
  fetchCwcFloodAdvisories,
  fetchFsiFireAlerts,
  PROVIDER_STATUS,
} = require('../services/travelIntelligence/safety/safetySourceAdapters');

describe('India In-Time v3.0 — Safety Provider Smoke & Health Matrix', () => {
  let originalRequest;

  beforeAll(() => {
    originalRequest = https.request;
  });

  afterAll(() => {
    https.request = originalRequest;
  });

  test('Provider Health Matrix contains all 4 official providers with required telemetry schema', () => {
    const providers = getSafetyProviders();
    expect(providers.length).toBeGreaterThanOrEqual(4);

    const expectedProviders = ['NDMA', 'IMD', 'CWC', 'FSI'];
    for (const p of expectedProviders) {
      const match = providers.find(r => r.provider === p);
      expect(match).toBeDefined();
      expect(match.name).toBeDefined();
      expect(match.connectionStatus).toBeDefined();
      expect(['LIVE', 'PARTIALLY_AVAILABLE', 'STALE', 'UNAVAILABLE']).toContain(match.connectionStatus);
      expect(match.freshness).toBeDefined();
      expect(match.failureCount).toBeGreaterThanOrEqual(0);
      expect(typeof match.productionUsable).toBe('boolean');
    }
  });

  test('Official providers never claim CONFIGURED_BUT_NOT_CONNECTED in production contract', () => {
    const providers = getSafetyProviders();
    for (const p of providers) {
      expect(p.connectionStatus).not.toBe('CONFIGURED_BUT_NOT_CONNECTED');
      expect(p.status).not.toBe('CONFIGURED_BUT_NOT_CONNECTED');
    }
  });

  test('CWC and FSI explicitly document boundary access limitations in production', async () => {
    https.request = jest.fn((url, options, cb) => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html' };
        res.setEncoding = jest.fn();
        process.nextTick(() => {
          res.emit('data', '<html>CWC Daily Flood Bulletin</html>');
          res.emit('end');
        });
        cb(res);
      });
      return req;
    });

    const [cwcRes, fsiRes] = await Promise.all([
      fetchCwcFloodAdvisories(),
      fetchFsiFireAlerts(),
    ]);

    expect(cwcRes.provider).toBe('CWC');
    expect(cwcRes.status).toBe(PROVIDER_STATUS.PARTIALLY_AVAILABLE);
    expect(cwcRes.limitation).toBeDefined();

    expect(fsiRes.provider).toBe('FSI');
    expect(fsiRes.status).toBe(PROVIDER_STATUS.PARTIALLY_AVAILABLE);
    expect(fsiRes.limitation).toBeDefined();
  });

  test('fetchNdmaAlerts and fetchImdWarnings correctly normalize records and handle network variance', async () => {
    // 1. Successful ingestion mock
    https.request = jest.fn((url, options, cb) => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = { 'content-type': 'application/json' };
        res.setEncoding = jest.fn();
        process.nextTick(() => {
          const urlStr = String(url);
          if (urlStr.includes('FetchAllAlertDetails')) {
            res.emit('data', JSON.stringify([{
              identifier: 1789115777826013,
              disaster_type: 'Moderate Rain',
              severity: 'ALERT',
              area_description: 'Kanpur Bijnor and Jalaun',
              centroid: '78.61,27.02',
              warning_message: 'Moderate rain expected',
            }]));
          } else if (urlStr.includes('districtWiseNowcast')) {
            res.emit('data', JSON.stringify([{
              id: '573',
              title: 'NICOBAR',
              color: '#FF0000',
              info: '<div>Heavy Rain</div>',
            }]));
          } else {
            res.emit('data', '[]');
          }
          res.emit('end');
        });
        cb(res);
      });
      return req;
    });

    const ndma = await fetchNdmaAlerts({ force: true });
    expect(Array.isArray(ndma)).toBe(true);
    expect(ndma.length).toBeGreaterThan(0);
    expect(ndma[0].provider).toBe('NDMA');
    expect(ndma[0].dataState).toBe('OFFICIAL_WARNING');

    const imd = await fetchImdWarnings({ force: true });
    expect(Array.isArray(imd)).toBe(true);
    expect(imd.length).toBeGreaterThan(0);
    expect(imd[0].provider).toBe('IMD');
    expect(imd[0].severity).toBe('CRITICAL');

    // 2. Network failure / error graceful degradation
    https.request = jest.fn(() => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn(() => {
        process.nextTick(() => req.emit('error', new Error('ECONNRESET')));
      });
      return req;
    });

    const degradedNdma = await fetchNdmaAlerts();
    expect(Array.isArray(degradedNdma)).toBe(true);

    const degradedImd = await fetchImdWarnings();
    expect(Array.isArray(degradedImd)).toBe(true);
  });
});
