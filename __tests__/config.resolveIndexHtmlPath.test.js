// __tests__/config.resolveIndexHtmlPath.test.js
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
  let existsSyncSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
    delete process.env.USE_DIST_FRONTEND;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (existsSyncSpy) existsSyncSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('defaults to source index even in production (avoids blank UI on asset path mismatch)', () => {
    process.env.NODE_ENV = 'production';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === distIndexPath);
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(sourceIndexPath);
  });

  test('serves dist when USE_DIST_FRONTEND=1 and dist exists', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_DIST_FRONTEND = '1';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === distIndexPath);
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(distIndexPath);
  });

  test('in production, falls back to source when no dist build exists', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_DIST_FRONTEND = '1';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(sourceIndexPath);
  });

  test('outside production, always serves the source file', () => {
    process.env.NODE_ENV = 'development';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(sourceIndexPath);
  });
});
