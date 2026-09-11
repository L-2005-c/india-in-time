// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:/Users/LOKESH CHILUKURI/.gemini/antigravity-ide/brain/e1686a9d-1226-4c58-8f31-1d98862e1c72';

async function dismissAllOverlays(page) {
  try {
    await page.evaluate(() => {
      const login = document.getElementById('login-screen');
      if (login) login.remove();
      const splash = document.getElementById('splash');
      if (splash) splash.remove();
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding) onboarding.remove();
    });
  } catch {}
}

test.describe('Phase 7 — Mobile-First Traveler Experience E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress onboarding overlay and set demo auth
    await page.addInitScript(() => {
      localStorage.setItem('tt_onboarded_v1', '1');
      localStorage.setItem('iit_auth_token', 'demo_token');
    });
  });

  test('verifies 5-tab mobile navigation, touch target compliance, and zero horizontal scroll across matrix', async ({ page }) => {
    test.setTimeout(60000);

    const viewports = [
      { name: '320x568 (iPhone SE 1)', width: 320, height: 568 },
      { name: '360x640 (Android small)', width: 360, height: 640 },
      { name: '375x667 (iPhone SE 2)', width: 375, height: 667 },
      { name: '390x844 (iPhone 13/14)', width: 390, height: 844 },
      { name: '412x915 (Pixel 7)', width: 412, height: 915 },
      { name: '430x932 (iPhone Pro Max)', width: 430, height: 932 },
      { name: '768x1024 (iPad)', width: 768, height: 1024 },
      { name: '1440x900 (Desktop)', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#app, [role="main"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Dismiss login/splash overlays
      await dismissAllOverlays(page);
      await page.waitForTimeout(300);

      // Verify zero horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow, `Overflow detected on ${vp.name}`).toBe(false);

      // Verify 5 navigation tabs exist
      const navItems = page.locator('#bottom-nav .nav-item');
      await expect(navItems).toHaveCount(5);

      // Verify touch target compliance (>= 44x44 CSS px)
      const box = await navItems.first().boundingBox();
      expect(box, `Bounding box missing for ${vp.name}`).not.toBeNull();
      if (box) {
        expect(box.height, `Touch height < 44 on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(box.width, `Touch width < 44 on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('verifies primary action discovery, "Why this?" bottom sheet, and stop completion on mobile (390x844)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Dismiss overlays
    await dismissAllOverlays(page);

    // Mount Trip Control Center in Journey View
    console.log('Mounting Trip Control Center on mobile...');
    await page.evaluate(async () => {
      const demoStops = [
        { id: 'stop_1', name: 'Katiki Waterfalls', cat: 'nature', coords: [18.167, 83.012], vt: 45, arriveAt: '09:30', leaveAt: '10:15' },
        { id: 'stop_2', name: 'Borra Caves Heritage Area', cat: 'heritage', coords: [18.280, 83.040], vt: 90, arriveAt: '11:00', leaveAt: '12:30' },
        { id: 'stop_3', name: 'Araku Tribal Coffee Museum', cat: 'culture', coords: [18.333, 82.883], vt: 60, arriveAt: '13:30', leaveAt: '14:30' },
      ];
      const slot = document.getElementById('trip-control-center-slot') || document.body;
      if (typeof window.initActiveTripControlCenter === 'function') {
        await window.initActiveTripControlCenter(slot, [demoStops], null);
      }
      // Ensure HUD slot is in journey-view and journey-view is active
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('journey-view', 1);
      }
    });
    await page.waitForTimeout(600);

    // 1. Verify Journey HUD is visible
    const tcc = page.locator('#trip-control-center');
    await expect(tcc).toBeVisible({ timeout: 10000 });
    const tccText = await tcc.innerText();
    expect(tccText).toContain('On Track');
    expect(tccText).toContain('Katiki Waterfalls');

    // 2. Verify ONE clear primary action button
    const primaryBtn = page.locator('#btn-complete-active-stop');
    await expect(primaryBtn).toBeVisible();
    await expect(primaryBtn).toContainText('Mark Completed');

    // Capture Screenshot: Mobile Journey HUD
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await tcc.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_journey_hud_390x844.png') });
    console.log('✓ Captured screenshot: mobile_journey_hud_390x844.png');

    // 3. Progressive Disclosure: Tap "Why this?" button
    console.log('Opening "Why this?" bottom sheet...');
    const whyBtn = page.locator('#btn-why-this-action');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click({ force: true });
    await page.waitForTimeout(500);

    // 4. Verify Bottom Sheet is active with visible close button
    const sheetBackdrop = page.locator('.iit-bottom-sheet-backdrop.active');
    await expect(sheetBackdrop).toBeVisible({ timeout: 5000 });
    const sheetHeading = page.locator('#bottom-sheet-heading');
    await expect(sheetHeading).toContainText('Why Katiki Waterfalls?');

    // Capture Screenshot: Mobile Bottom Sheet
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_bottom_sheet_why.png') });
    console.log('✓ Captured screenshot: mobile_bottom_sheet_why.png');

    // Close bottom sheet
    const closeBtn = page.locator('.bottom-sheet-close-btn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click({ force: true });
    await page.waitForTimeout(400);
    await expect(sheetBackdrop).not.toBeVisible();

    // 5. Complete Stop
    console.log('Completing active stop...');
    await primaryBtn.click({ force: true });
    await page.waitForTimeout(800);

    // 6. Verify Progress updated: Borra Caves is now active stop
    const updatedText = await tcc.innerText();
    expect(updatedText).toContain('Borra Caves Heritage Area');
    console.log('✓ Verified stop completion and progress transition to Borra Caves');
  });

  test('verifies safety alert dominance, replan adaptation, and Next Journey completion flow', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Dismiss overlays and mount
    await dismissAllOverlays(page);
    await page.evaluate(async () => {
      const demoStops = [
        { id: 'stop_1', name: 'Katiki Waterfalls', cat: 'nature', coords: [18.167, 83.012], vt: 45, arriveAt: '09:30', leaveAt: '10:15' },
      ];
      const slot = document.getElementById('trip-control-center-slot') || document.body;
      if (typeof window.initActiveTripControlCenter === 'function') {
        await window.initActiveTripControlCenter(slot, [demoStops], null);
      }
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('journey-view', 1);
      }
    });
    await page.waitForTimeout(600);

    // 1. Simulate Ghat Rain / Reality Disruption
    console.log('Triggering Ghat Rain disruption...');
    await page.evaluate(() => {
      const btn = document.getElementById('btn-simulate-ghat-rain');
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);

    // 2. Verify Dominant Safety Alert
    const safetyBanner = page.locator('.safety-alert-dominant');
    await expect(safetyBanner).toBeVisible({ timeout: 5000 });
    const bannerText = await safetyBanner.innerText();
    expect(bannerText).toContain('REALITY DISRUPTION DETECTED');

    // Capture Screenshot: Dominant Safety Alert
    await safetyBanner.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_safety_dominant_alert.png') });
    console.log('✓ Captured screenshot: mobile_safety_dominant_alert.png');

    // 3. Adapt Plan
    const adaptBtn = page.locator('#btn-trigger-replan');
    await expect(adaptBtn).toBeVisible();
    await adaptBtn.click({ force: true });
    await page.waitForTimeout(800);

    // 4. Conclude Current Leg to trigger Next Journey Intelligence
    console.log('Finishing current leg...');
    const finishBtn = page.locator('#btn-finish-journey-to-next');
    await expect(finishBtn).toBeVisible();
    await finishBtn.click({ force: true });
    await page.waitForTimeout(800);

    // 5. Verify Next Journey Panel & 8 Intent Chips
    const nextPanel = page.locator('#next-journey-panel');
    await expect(nextPanel).toBeVisible({ timeout: 5000 });
    const nextText = await nextPanel.innerText();
    expect(nextText).toContain('CURRENT LEG COMPLETE');
    expect(nextText).toContain('Where would you like to go next?');

    const intentChips = page.locator('.intent-chip');
    await expect(intentChips).toHaveCount(8);

    // Capture Screenshot: Next Journey Intent Picker
    await nextPanel.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_next_journey_intent_picker.png') });
    console.log('✓ Captured screenshot: mobile_next_journey_intent_picker.png');

    // 6. Select "Food" Intent
    console.log('Selecting Food intent...');
    const foodChip = page.locator('.btn-next-intent[data-next-intent="GO_TO_RESTAURANT"]');
    await foodChip.click({ force: true });
    await page.waitForTimeout(600);

    // 7. Verify Restaurant Candidates
    const candidateCards = page.locator('.next-candidate-card');
    await expect(candidateCards.first()).toBeVisible();
    const foodText = await candidateCards.first().innerText();
    expect(foodText).toContain('Sea Inn');
    expect(foodText).toContain('Select');
    expect(foodText).toContain('Details');

    // Capture Screenshot: Restaurant Candidates
    await nextPanel.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_restaurant_candidates.png') });
    console.log('✓ Captured screenshot: mobile_restaurant_candidates.png');

    // 8. Simulate Train Departure Deadline Risk
    console.log('Simulating Train Departure Deadline...');
    await page.evaluate(() => {
      const btn = document.getElementById('btn-simulate-next-deadline');
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);

    // 9. Verify Sticky Transport Departure Warning
    const deadlineCard = page.locator('.deadline-risk-sticky');
    await expect(deadlineCard).toBeVisible({ timeout: 5000 });
    const deadlineText = await deadlineCard.innerText();
    expect(deadlineText).toContain('TRAIN DEPARTS IN 42 MIN');
    expect(deadlineText).toContain('DEADLINE RISK');
    expect(deadlineText).toContain('START ROUTE NOW');

    // Capture Screenshot: Sticky Transport Deadline
    await deadlineCard.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_transport_deadline.png') });
    console.log('✓ Captured screenshot: mobile_transport_deadline.png');
  });

  test('verifies desktop and tablet responsive presentation', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Tablet Viewport (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await dismissAllOverlays(page);
    await page.evaluate(async () => {
      const demoStops = [
        { id: 'stop_1', name: 'Katiki Waterfalls', cat: 'nature', coords: [18.167, 83.012], vt: 45 },
      ];
      const slot = document.getElementById('trip-control-center-slot') || document.body;
      if (typeof window.initActiveTripControlCenter === 'function') {
        await window.initActiveTripControlCenter(slot, [demoStops], null);
      }
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('journey-view', 1);
      }
    });
    await page.waitForTimeout(600);

    const tcc = page.locator('#trip-control-center');
    await expect(tcc).toBeVisible({ timeout: 10000 });
    await tcc.screenshot({ path: path.join(ARTIFACTS_DIR, 'tablet_journey_hud_768x1024.png') });
    console.log('✓ Captured screenshot: tablet_journey_hud_768x1024.png');

    // 2. Desktop Viewport (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await tcc.screenshot({ path: path.join(ARTIFACTS_DIR, 'desktop_hud_1440x900.png') });
    console.log('✓ Captured screenshot: desktop_hud_1440x900.png');
  });
});
