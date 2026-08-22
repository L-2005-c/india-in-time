/**
 * Production acceptance E2E configuration.
 * CI installs Playwright Chromium and runs against the staging server.
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const { defineConfig } = require('@playwright/test');
const path = require('path');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

module.exports = defineConfig({
  testDir: './specs',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node server.js',
    cwd: path.join(__dirname, '../..'),
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      USE_DIST_FRONTEND: 'true',
      SKIP_DB_INIT: 'true',
      GEMINI_API_KEY: 'e2e-placeholder-key',
      PORT: '3000',
    },
  },
});
