// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('India In-Time critical UI journeys', () => {
  test('home loads and exposes main landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app, [role="main"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.skip-link, a[href="#app"]')).toHaveCount(1);
  });

  test('health endpoint is reachable', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
