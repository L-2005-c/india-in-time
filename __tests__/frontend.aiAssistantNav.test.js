const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX_HTML_PATH = path.join(__dirname, '../frontend/app-src/index.html');
const MOBILE_SHELL_PATH = path.join(__dirname, '../frontend/app-src/src/modules/mobileShell.js');
const MORE_MENU_PATH = path.join(__dirname, '../frontend/app-src/src/modules/moreMenu.js');

describe('AI Assistant primary nav + Alerts in More', () => {
  test('index.html bottom nav exposes AI Assistant in place of Alerts', () => {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const navItems = [...doc.querySelectorAll('#bottom-nav .nav-item')];
    const labels = navItems.map((item) => item.querySelector('.nav-lbl')?.textContent?.trim());
    expect(labels).toEqual(['Map', 'Journey', 'Plan', 'AI Assistant', 'More']);

    const aiTab = doc.querySelector('#bottom-nav .nav-item[data-view="chat-view"][data-idx="3"]');
    expect(aiTab).toBeTruthy();

    const alertsPrimaryTab = doc.querySelector('#bottom-nav .nav-item[data-view="alerts-view"]');
    expect(alertsPrimaryTab).toBeNull();

    const alertsBadge = doc.getElementById('nav-alert-badge');
    expect(alertsBadge).toBeTruthy();
    expect(alertsBadge.closest('.nav-item')?.getAttribute('data-view')).toBe('more-view');

    expect(doc.getElementById('alerts-view')).toBeTruthy();
  });

  test('mobile shell routes alerts through More and keeps AI Assistant as a primary tab', () => {
    const mobileShell = fs.readFileSync(MOBILE_SHELL_PATH, 'utf8');
    const moreMenu = fs.readFileSync(MORE_MENU_PATH, 'utf8');

    expect(mobileShell).toMatch(/\{\s*id:\s*'chat-view',\s*label:\s*'AI Assistant'/);
    expect(mobileShell).toMatch(/\{\s*id:\s*'more-view',\s*label:\s*'More',\s*icon:\s*'☰',\s*hasBadge:\s*true\s*\}/);
    expect(mobileShell).toMatch(/if \(tool === 'alerts'\)\s*\{\s*refreshAlertsView\(\);\s*switchMobileTab\('alerts-view', 4\);/);
    expect(mobileShell).toMatch(/if \(viewId === 'chat-view'\) return 3;/);
    expect(mobileShell).toMatch(/if \(viewId === 'more-view' \|\| viewId === 'tools-view' \|\| viewId === 'alerts-view'\) return 4;/);

    expect(moreMenu).toMatch(/name:\s*'Alerts Center'/);
    expect(moreMenu).toMatch(/action:\s*'alerts'/);
  });
});
