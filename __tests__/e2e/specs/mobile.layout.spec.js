// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/LOKESH CHILUKURI/.gemini/antigravity-ide/brain/ce2f14f5-5e78-4675-9075-5ef798e72ad4';

async function dismissAllOverlays(page) {
  try {
    await page.evaluate(() => {
      if (typeof window.dismissSplash === 'function') window.dismissSplash();
      const skipBtn = document.querySelector('.btn-skip-splash');
      if (skipBtn) /** @type {HTMLElement} */ (skipBtn).click();
      const splash = document.getElementById('splash');
      if (splash) splash.remove();
      const login = document.getElementById('login-screen');
      if (login) login.remove();
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding) onboarding.remove();
    });
    await page.waitForTimeout(800);
  } catch {}
}

test.describe('Mobile Viewport Layout & No-Cutoff Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tt_onboarded_v1', '1');
      localStorage.setItem('iit_auth_token', 'demo_token');
      // @ts-ignore
      window.currentUser = { id: 'demo_traveler', name: 'Traveler' };
    });
  });

  test('verifies alerts center cards and filter tabs fit within mobile viewport with zero clipping', async ({ page }) => {
    // 390x844 (standard modern smartphone viewport like in user screenshots)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 15000 });
    await dismissAllOverlays(page);
    await page.waitForTimeout(300);

    // Switch to More view
    await page.evaluate(() => {
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('more-view', 4);
      } else {
        const moreTab = document.querySelector('.nav-item[data-view="more-view"]');
        if (moreTab) /** @type {HTMLElement} */ (moreTab).click();
      }
    });
    await page.waitForTimeout(400);

    // Open Alerts Center
    await page.evaluate(() => {
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('alerts-view', 4);
      }
    });
    await page.waitForTimeout(600);

    // Verify all alert cards are completely within viewport width (right <= 390)
    const metrics = await page.evaluate(() => {
      const view = document.getElementById('alerts-view');
      const cards = view ? Array.from(view.querySelectorAll('.alert-card-responsive')) : [];
      const tabBar = view ? view.querySelector('.alerts-tab-bar') : null;
      const vw = window.innerWidth;

      return {
        vw,
        viewScrollWidth: view ? view.scrollWidth : 0,
        viewClientWidth: view ? view.clientWidth : 0,
        cardsCount: cards.length,
        tabBarWidth: tabBar ? tabBar.getBoundingClientRect().width : 0,
        tabBarRight: tabBar ? tabBar.getBoundingClientRect().right : 0,
        cards: cards.map((c, i) => {
          const r = c.getBoundingClientRect();
          const title = c.querySelector('.alert-title-responsive')?.textContent || '';
          return {
            i,
            title,
            left: r.left,
            right: r.right,
            width: r.width,
            exceedsViewport: r.right > vw + 1,
          };
        }),
      };
    });

    console.log('Alerts layout metrics:', JSON.stringify(metrics, null, 2));

    expect(metrics.cardsCount).toBeGreaterThan(0);
    for (const card of metrics.cards) {
      expect(card.exceedsViewport, `Card "${card.title}" exceeds viewport! right=${card.right} > vw=${metrics.vw}`).toBe(false);
      expect(card.left).toBeGreaterThanOrEqual(0);
    }

    // Capture screenshot of Alerts View
    await page.evaluate(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.style.display = 'none';
    });
    const alertsView = page.locator('#alerts-view');
    await alertsView.screenshot({ path: path.join(ARTIFACTS_DIR, 'verified_alerts_view_390x844.png') });
  });

  test('verifies itinerary header action buttons do not cut off on mobile viewports', async ({ page }) => {
    // 390x844 (standard mobile viewport)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 15000 });
    await dismissAllOverlays(page);
    await page.waitForTimeout(300);

    // Switch to Plan view and enable itinerary action buttons
    await page.evaluate(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.style.display = 'none';
      const planTab = document.querySelector('.nav-item[data-view="plan-view"]');
      if (planTab) /** @type {HTMLElement} */ (planTab).click();
      ['btn-save', 'btn-share', 'btn-pass'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'inline-flex';
      });
    });
    await page.waitForTimeout(400);

    const itinMetrics = await page.evaluate(() => {
      const hdr = document.querySelector('.itin-hdr');
      const actions = document.querySelector('.itin-actions');
      const btns = actions ? Array.from(actions.querySelectorAll('.itn-btn, .status-chip')) : [];
      const vw = window.innerWidth;
      const hdrRect = hdr ? hdr.getBoundingClientRect() : null;

      return {
        vw,
        hdrRight: hdrRect ? hdrRect.right : 0,
        hdrOverflows: hdrRect ? hdrRect.right > vw + 1 : false,
        actionsScrollWidth: actions ? actions.scrollWidth : 0,
        actionsClientWidth: actions ? actions.clientWidth : 0,
        buttons: btns.map(b => {
          const r = b.getBoundingClientRect();
          return {
            id: b.id || b.className,
            text: b.innerText.trim(),
            visible: window.getComputedStyle(b).display !== 'none',
            left: r.left,
            right: r.right,
            width: r.width,
          };
        }),
      };
    });

    console.log('Itinerary Header layout metrics:', JSON.stringify(itinMetrics, null, 2));

    expect(itinMetrics.hdrOverflows).toBe(false);
    const visibleBtns = itinMetrics.buttons.filter(b => b.visible);
    expect(visibleBtns.length).toBeGreaterThanOrEqual(4);

    // Verify budget button is not clipped to 'Bud' and PLAN status chip is rendered
    const budgetBtn = visibleBtns.find(b => b.text.includes('Budget'));
    expect(budgetBtn).toBeDefined();
    expect(budgetBtn?.visible).toBe(true);
    expect(budgetBtn?.width).toBeGreaterThan(30);

    const planChip = visibleBtns.find(b => b.text.includes('PLAN'));
    expect(planChip).toBeDefined();
    expect(planChip?.visible).toBe(true);

    // Capture screenshot
    const planSticky = page.locator('.plan-sticky-group');
    await planSticky.screenshot({ path: path.join(ARTIFACTS_DIR, 'verified_itinerary_header_390x844.png') });
  });

  test('verifies ultra-compact 360x640 Android viewport has no clipping', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 15000 });
    await dismissAllOverlays(page);
    await page.waitForTimeout(300);

    // Check Alerts View on 360px
    await page.evaluate(() => {
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('alerts-view', 4);
      }
    });
    await page.waitForTimeout(500);

    const alertsMetrics = await page.evaluate(() => {
      const view = document.getElementById('alerts-view');
      const cards = view ? Array.from(view.querySelectorAll('.alert-card-responsive')) : [];
      const vw = window.innerWidth;
      return cards.map(c => ({
        right: c.getBoundingClientRect().right,
        exceeds: c.getBoundingClientRect().right > vw + 1,
      }));
    });

    for (const c of alertsMetrics) {
      expect(c.exceeds).toBe(false);
    }

    // Check Plan View Itinerary Header on 360px
    await page.evaluate(() => {
      if (typeof window.switchMobileTab === 'function') {
        window.switchMobileTab('plan-view', 2);
      }
      if (typeof window.generatePlan === 'function') {
        window.generatePlan();
      }
    });
    await page.waitForTimeout(1000);

    const itinMetrics = await page.evaluate(() => {
      const hdr = document.querySelector('.itin-hdr');
      const vw = window.innerWidth;
      return {
        hdrRight: hdr ? hdr.getBoundingClientRect().right : 0,
        overflows: hdr ? hdr.getBoundingClientRect().right > vw + 1 : false,
      };
    });

    expect(itinMetrics.overflows).toBe(false);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'verified_360x640_layout.png') });
  });
});
