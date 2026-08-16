const fs = require('fs');
const path = require('path');

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('config.resolveIndexHtmlPath', () => {
  const ORIGINAL_ENV = { ...process.env };
  const distIndexPath = path.join(__dirname, '..', 'frontend', 'public', 'dist', 'index.html');
  const sourceIndexPath = path.join(__dirname, '..', 'frontend', 'public', 'index.html');

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
    // avoid production configuration validation failure in config's production Firebase guard when tests
    // below set NODE_ENV=production — see middleware.errorHandler.test.js for
    // the matching comment.
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: 'test-key',
    });
    delete process.env.USE_DIST_FRONTEND;
    delete process.env.USE_SOURCE_FRONTEND;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  test('USE_SOURCE_FRONTEND=1 is rejected in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_SOURCE_FRONTEND = '1';
    const config = loadConfigFresh();
    expect(() => config.resolveIndexHtmlPath()).toThrow(/forbidden in production/i);
  });

  test('USE_DIST_FRONTEND=1 serves dist when file exists', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_DIST_FRONTEND = '1';
    const config = loadConfigFresh();
    // dist was built in this workspace
    if (fs.existsSync(distIndexPath)) {
      expect(config.resolveIndexHtmlPath()).toBe(distIndexPath);
    } else {
      expect(() => config.resolveIndexHtmlPath()).toThrow(/missing or unhealthy/i);
    }
  });

  test('in production with healthy dist assets, prefers dist', () =>{
    process.env.NODE_ENV = 'production';
    const config = loadConfigFresh();
    const resolved = config.resolveIndexHtmlPath();
    if (fs.existsSync(distIndexPath)) {
      // After build:frontend, dist should be healthy
      expect(resolved).toBe(distIndexPath);
      // If assets exist under dist/assets, expect dist
      const assetsDir = path.join(__dirname, '..', 'frontend', 'public', 'dist', 'assets');
      if (fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0) {
        expect(resolved).toBe(distIndexPath);
      }
    } else {
      expect(() => config.resolveIndexHtmlPath()).toThrow(/missing or unhealthy/i);
    }
  });

  test('outside production defaults to source', () => {
    process.env.NODE_ENV = 'development';
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(sourceIndexPath);
  });
});
