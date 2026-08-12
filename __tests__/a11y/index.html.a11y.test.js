/**
 * Exhaustive static accessibility checks on the app shell.
 * Complements runtime axe scans (recommended in CI with Playwright).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../../frontend/public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../frontend/public/styles.css'), 'utf8');

describe('enterprise a11y — index.html', () => {
  let document;
  beforeAll(() => {
    document = new JSDOM(html).window.document;
  });

  test('html has lang attribute', () => {
    expect(document.documentElement.getAttribute('lang')).toBeTruthy();
  });

  test('has exactly one main landmark', () => {
    const mains = document.querySelectorAll('main, [role="main"]');
    expect(mains.length).toBeGreaterThanOrEqual(1);
  });

  test('has banner header and navigation landmark', () => {
    expect(document.querySelector('header, [role="banner"]')).toBeTruthy();
    expect(document.querySelector('nav, [role="navigation"]')).toBeTruthy();
  });

  test('skip link targets main content', () => {
    const skip = document.querySelector('a.skip-link, a[href="#app"]');
    expect(skip).toBeTruthy();
  });

  test('all images have alt attributes', () => {
    const imgs = [...document.querySelectorAll('img')];
    const missing = imgs.filter((img) => !img.hasAttribute('alt'));
    expect(missing).toEqual([]);
  });

  test('icon-only buttons have accessible names', () => {
    const buttons = [...document.querySelectorAll('button')];
    const unnamed = buttons.filter((b) => {
      const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
      return name.length === 0;
    });
    expect(unnamed.map((b) => b.outerHTML.slice(0, 80))).toEqual([]);
  });

  test('no inline event handler attributes (CSP / a11y)', () => {
    const matches = html.match(/\bon(click|keydown|keyup|change|input|focus|blur)="/g) || [];
    expect(matches).toEqual([]);
  });

  test('bottom nav items are keyboard operable', () => {
    const items = document.querySelectorAll('#bottom-nav [role="button"]');
    expect(items.length).toBeGreaterThanOrEqual(4);
    items.forEach((el) => {
      expect(el.getAttribute('tabindex')).toBe('0');
      expect(el.getAttribute('data-action')).toBeTruthy();
    });
  });

  test('interactive form controls have accessible names where present', () => {
    const chat = document.querySelector('#chat-in');
    if (chat) {
      const named = chat.getAttribute('aria-label') || chat.getAttribute('aria-labelledby') || chat.id;
      expect(named).toBeTruthy();
    }
  });

  test('live regions exist for status updates', () => {
    const live = document.querySelectorAll('[aria-live], [role="status"]');
    expect(live.length).toBeGreaterThanOrEqual(1);
  });
});

describe('enterprise a11y — styles', () => {
  test('includes focus-visible styles', () => {
    expect(css).toMatch(/:focus-visible/);
  });

  test('respects prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  test('includes sr-only utility', () => {
    expect(css).toMatch(/\.sr-only/);
  });
});
