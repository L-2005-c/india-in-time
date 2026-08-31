'use strict';

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('Production Configuration Validation - DB Pool Sizing', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = 'production';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: 'test-key',
    });
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'https://indiaintime.com';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  test('throws when CLUSTER_WORKERS * DB_POOL_MAX exceeds MAX_DB_CONNECTIONS', () => {
    process.env.CLUSTER_WORKERS = '4';
    process.env.DB_POOL_MAX = '8'; // 4 * 8 = 32 connections
    process.env.MAX_DB_CONNECTIONS = '20';

    const config = loadConfigFresh();
    expect(() => config.validateProductionConfig()).toThrow(
      /exceeds MAX_DB_CONNECTIONS ceiling/
    );
  });

  test('succeeds when pool sizing is within MAX_DB_CONNECTIONS', () => {
    process.env.CLUSTER_WORKERS = '2';
    process.env.DB_POOL_MAX = '5'; // 2 * 5 = 10 connections
    process.env.MAX_DB_CONNECTIONS = '20';

    const config = loadConfigFresh();
    expect(() => config.validateProductionConfig()).not.toThrow();
  });

  test('logs warning when MAX_DB_CONNECTIONS is unset in production', () => {
    delete process.env.MAX_DB_CONNECTIONS;
    process.env.CLUSTER_WORKERS = '1';
    process.env.DB_POOL_MAX = '5';

    const warnSpy = jest.spyOn(console, 'warn');
    const config = loadConfigFresh();
    config.validateProductionConfig();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('MAX_DB_CONNECTIONS is not set in production')
    );
  });
});
