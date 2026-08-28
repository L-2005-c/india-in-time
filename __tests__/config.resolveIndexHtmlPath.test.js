const fs = require('fs');
const path = require('path');

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('config.resolveIndexHtmlPath', () => {
  const ORIGINAL_ENV = { ...process.env };
  const distIndexPath = path.join(__dirname, '..', 'frontend', 'public', 'dist', 'index.html');
  // The dev/source entry point lives at dev-index.html — plain index.html
  // under public/ was retired so it can't be confused with the built dist
  // output.
  const sourceIndexPath = path.join(__dirname, '..', 'frontend', 'public', 'dev-index.html');
  // Mirrors config's own distIsHealthy(): the index.html existing on disk
  // isn't enough — the JS/CSS assets it references must exist too.
  const distHealthy = (() => {
    if (!fs.existsSync(distIndexPath)) return false;
    try {
      const html = fs.readFileSync(distIndexPath, 'utf8');
      const refs = [];
      const re = /(?:src|href)=["']([^"']*assets\/[^"']+)["']/g;
      let match;
      while ((match = re.exec(html)) !== null) refs.push(match[1]);
      if (!refs.length) return false;
      return refs.every((ref) => {
        const rel = ref.replace(/^\//, '');
        const candidates = [
          path.join(__dirname, '..', 'frontend', 'public', rel),
          path.join(__dirname, '..', 'frontend', 'public', 'dist', rel.replace(/^dist\//, '')),
          path.join(__dirname, '..', 'frontend', 'public', 'dist', 'assets', path.basename(rel)),
        ];
        return candidates.some((candidate) => fs.existsSync(candidate));
      });
    } catch (_error) {
      return false;
    }
  })();

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
    // dist is only usable when the assets it references actually exist
    if (distHealthy) {
      expect(config.resolveIndexHtmlPath()).toBe(distIndexPath);
    } else {
      expect(() => config.resolveIndexHtmlPath()).toThrow(/missing or unhealthy/i);
    }
  });

  test('in production with healthy dist assets, prefers dist', () =>{
    process.env.NODE_ENV = 'production';
    if (distHealthy) {
      const config = loadConfigFresh();
      // After build:frontend, dist should be healthy
      expect(config.resolveIndexHtmlPath()).toBe(distIndexPath);
    } else {
      const config = loadConfigFresh();
      expect(() => config.resolveIndexHtmlPath()).toThrow(/missing or unhealthy/i);
    }
  });

  test('outside production defaults to source', () => {
    process.env.NODE_ENV = 'development';
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(sourceIndexPath);
  });
});
