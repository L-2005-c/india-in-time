/**
 * Optional Playwright browser e2e config.
 * Install with: npm i -D @playwright/test && npx playwright install
 * Run with: npx playwright test --config __tests__/e2e/playwright.config.js
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './specs',
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node server.js',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
};
