'use strict';
/* global window, document */

const { chromium } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACTS_DIR = 'C:/Users/LOKESH CHILUKURI/.gemini/antigravity-ide/brain/e1686a9d-1226-4c58-8f31-1d98862e1c72';
const PORT = 3000;

async function pollServerReady(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) {
        console.log('Server is ready and responding on port', PORT);
        return true;
      }
    } catch (_e) {
      // wait and retry
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

(async () => {
  let serverProc = null;
  const isReady = await pollServerReady(1000);

  if (!isReady) {
    console.log('Spawning node server.js with SKIP_DB_INIT=true ...');
    serverProc = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(PORT),
        USE_DIST_FRONTEND: 'true',
        SKIP_DB_INIT: 'true',
        CLUSTER_WORKERS: '1',
      },
      stdio: 'pipe',
    });

    const started = await pollServerReady(15000);
    if (!started) {
      if (serverProc) serverProc.kill();
      throw new Error('Server failed to start within 15 seconds.');
    }
  }

  console.log('Launching browser with Playwright Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log(`Navigating to http://127.0.0.1:${PORT}/ ...`);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Dismiss onboarding modal if present
  try {
    const guestBtn = await page.$('#btn-guest, button:has-text("Continue as Guest"), .guest-btn');
    if (guestBtn) {
      console.log('Dismissing guest modal...');
      await guestBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch (_e) {
    console.log('No guest modal found or already dismissed.');
  }

  // Mount Trip Control Center into document.body for high-fidelity unoccluded capture
  console.log('Mounting Trip Control Center directly into document.body...');
  await page.evaluate(async () => {
    let slot = document.getElementById('trip-control-center-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'trip-control-center-slot';
      document.body.appendChild(slot);
    } else {
      document.body.appendChild(slot);
    }
    slot.style.display = 'block';
    slot.style.position = 'relative';
    slot.style.zIndex = '99999';
    slot.style.background = '#0b1120';
    slot.style.padding = '20px';

    const demoStops = [
      { id: 'stop_1', name: 'Kailasagiri Hilltop Park', cat: 'scenic', coords: [17.749, 83.342], vt: 60, status: 'COMPLETED' },
      { id: 'stop_2', name: 'INS Kursura Submarine Museum', cat: 'museum', coords: [17.717, 83.332], vt: 45, status: 'COMPLETED' },
      { id: 'stop_3', name: 'Borra Caves Heritage Area', cat: 'nature', coords: [18.280, 83.040], vt: 90, status: 'COMPLETED' }
    ];

    if (typeof window.initActiveTripControlCenter === 'function') {
      await window.initActiveTripControlCenter(slot, demoStops);
    }
  });
  await page.waitForTimeout(1000);

  // Step 1: Trigger Journey Completion to open Next Journey Panel
  console.log('Triggering Journey Completion / Next Journey Panel...');
  await page.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.remove();
    const finishBtn = document.getElementById('btn-finish-journey-to-next');
    if (finishBtn) finishBtn.click();
  });
  await page.waitForTimeout(800);

  // Capture Screenshot 1: Intent Picker (Prompt: next_journey_intent_picker.png)
  const shot1Path = path.join(ARTIFACTS_DIR, 'next_journey_intent_picker.png');
  await page.locator('#next-journey-panel').screenshot({ path: shot1Path });
  console.log('✓ Captured screenshot 1: next_journey_intent_picker.png');

  // Step 2: Click Hotel / Stay intent button
  console.log('Selecting Hotel / Stay intent...');
  await page.evaluate(() => {
    const btn = document.querySelector('.btn-next-intent[data-next-intent="GO_TO_HOTEL"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(600);

  // Capture Screenshot 2: Hotel Candidates & Price Decomposition (Prompt: next_journey_hotel_candidates.png)
  const shot2Path = path.join(ARTIFACTS_DIR, 'next_journey_hotel_candidates.png');
  await page.locator('#next-journey-panel').screenshot({ path: shot2Path });
  console.log('✓ Captured screenshot 2: next_journey_hotel_candidates.png');

  // Step 3: Click "Start Next Leg" button
  console.log('Clicking [Start Next Leg] button...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-start-next-leg');
    if (btn) btn.click();
  });
  await page.waitForTimeout(600);

  // Capture Screenshot 3: Leg 2 Active with Leg 1 completed (Prompt: next_journey_leg2_active.png)
  const shot3Path = path.join(ARTIFACTS_DIR, 'next_journey_leg2_active.png');
  await page.locator('#trip-control-center').screenshot({ path: shot3Path });
  console.log('✓ Captured screenshot 3: next_journey_leg2_active.png');

  // Step 4: Click "Train Deadline Risk" mutation button
  console.log('Triggering Train Deadline Risk simulation...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-simulate-next-deadline');
    if (btn) btn.click();
  });
  await page.waitForTimeout(600);

  // Capture Screenshot 4: Deadline Risk State & Buffer Alert (Prompt: next_journey_deadline_risk.png)
  const shot4Path = path.join(ARTIFACTS_DIR, 'next_journey_deadline_risk.png');
  await page.locator('#trip-control-center').screenshot({ path: shot4Path });
  console.log('✓ Captured screenshot 4: next_journey_deadline_risk.png');

  console.log('\n======================================================');
  console.log('ALL 4 PHASE 6 VISUAL ARTIFACTS CAPTURED SUCCESSFULLY!');
  console.log('======================================================\n');

  await browser.close();
  if (serverProc) {
    serverProc.kill('SIGTERM');
  }
  process.exit(0);
})().catch(err => {
  console.error('Phase 6 E2E Verification failed:', err);
  process.exit(1);
});
