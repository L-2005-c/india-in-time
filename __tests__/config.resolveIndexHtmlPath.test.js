// __tests__/config.resolveIndexHtmlPath.test.js — Regression tests for
// config.resolveIndexHtmlPath(), added to close the "build tooling exists
// but is never actually served" gap (see scripts/build-frontend.js and
// server.js). This is the single decision point that determines whether a
// request gets the raw source index.html or the minified, content-hashed
// frontend/public/dist/index.html — getting it wrong either 404s in
// production or silently keeps serving unminified assets forever, so it's
// worth locking in all three states directly rather than only exercising
// it via the full server.

const fs = require('fs');
const path = require('path');

function loadConfigFresh() {
  jest.resetModules();
  return require('../config');
}

describe('config.resolveIndexHtmlPath', () => {
  const ORIGINAL_ENV = { ...process.env };
  const distIndexPath = path.join(__dirname, '..', 'frontend', 'public', 'dist', 'index.html');
  let existsSyncSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CORS_ORIGIN = 'https://example.com';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (existsSyncSpy) existsSyncSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('in production, serves the dist build when it exists', () => {
    process.env.NODE_ENV = 'production';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === distIndexPath);

    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(distIndexPath);
  });

  test('in production, falls back to the source file when no dist build exists', () => {
    process.env.NODE_ENV = 'production';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(
      path.join(__dirname, '..', 'frontend', 'public', 'index.html')
    );
  });

  test('outside production, always serves the source file even if a dist build exists', () => {
    process.env.NODE_ENV = 'development';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    const config = loadConfigFresh();
    expect(config.resolveIndexHtmlPath()).toBe(
      path.join(__dirname, '..', 'frontend', 'public', 'index.html')
    );
  });
});
