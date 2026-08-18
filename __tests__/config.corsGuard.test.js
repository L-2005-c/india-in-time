// Regression tests for the production configuration guard. Config validation
// is now explicit and throws a typed error instead of terminating the process
// during module import, so Jest workers remain isolated and testable.

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('config CORS wildcard guard', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY = 'test-key';
    // avoid tripping config's *separate* production Firebase guard in the
    // tests below that require a complete production configuration. This suite
    // only cares about the CORS wildcard guard specifically. See
    // middleware.errorHandler.test.js
    // for the matching comment on that guard.
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: 'test-key',
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  test('rejects invalid wildcard CORS configuration in production without exiting the test worker', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ALLOW_WILDCARD;

    const config = loadConfigFresh();
    expect(() => config.validateProductionConfig()).toThrow(/Production configuration error/);
  });

  test('accepts a real CORS origin in production config', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://indiaintime.com';

    expect(() => loadConfigFresh()).not.toThrow();
  });

  test('accepts an explicitly opted-in wildcard in production config', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    process.env.CORS_ALLOW_WILDCARD = 'true';

    expect(() => loadConfigFresh()).not.toThrow();
  });

  test('does not validate the production CORS guard outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;

    expect(() => loadConfigFresh()).not.toThrow();
  });
});
