describe('lib/logger', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  test('exports a pino-compatible logger with standard level methods', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
    jest.resetModules();
    const logger = require('../lib/logger');

    ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].forEach((level) => {
      expect(typeof logger[level]).toBe('function');
    });
  });

  test('respects LOG_LEVEL env var', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.LOG_LEVEL = 'warn';
    jest.resetModules();
    const logger = require('../lib/logger');

    expect(logger.level).toBe('warn');
  });

  test('defaults to debug level outside production', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    jest.resetModules();
    const logger = require('../lib/logger');

    expect(logger.level).toBe('debug');
  });
});
