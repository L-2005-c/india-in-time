// @ts-check
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

test.describe('India In-Time critical UI journeys', () => {
  test('home loads and exposes main landmark', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#app, [role="main"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.skip-link, a[href="#app"]')).toHaveCount(1);
  });

  test('health endpoint is reachable', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-security-policy']).toBeTruthy();
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('@a11y home has no serious or critical axe violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('@perf initial document stays within a basic performance budget', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const metrics = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? {
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
      } : null;
    });
    expect(metrics).not.toBeNull();
    expect(metrics.ttfb).toBeLessThanOrEqual(Number(process.env.E2E_MAX_TTFB_MS || 1500));
    expect(metrics.load).toBeLessThanOrEqual(Number(process.env.E2E_MAX_LOAD_MS || 5000));
  });
});
