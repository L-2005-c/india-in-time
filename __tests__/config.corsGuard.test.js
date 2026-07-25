// Regression tests for the CORS_ORIGIN='*' production guard added to
// config/index.js. Because config/index.js has top-level side effects
// (it may call process.exit), we mock process.exit and re-require the
// module fresh for each scenario.

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('config CORS wildcard guard', () => {
  const ORIGINAL_ENV = { ...process.env };
  let exitSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY = 'test-key';
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  test('exits the process if CORS_ORIGIN is wildcard in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ALLOW_WILDCARD;

    expect(() => loadConfigFresh()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('does NOT exit if CORS_ORIGIN is explicitly set to a real origin', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://indiaintime.com';

    expect(() => loadConfigFresh()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('allows wildcard in production if explicitly opted in via CORS_ALLOW_WILDCARD', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    process.env.CORS_ALLOW_WILDCARD = 'true';

    expect(() => loadConfigFresh()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('does NOT exit on wildcard outside of production (development)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;

    expect(() => loadConfigFresh()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
