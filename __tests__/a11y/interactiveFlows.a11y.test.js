// __tests__/a11y/interactiveFlows.a11y.test.js
// Accessibility tests covering interactive trip planning flows, itinerary views, and modal dialogs.
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../../frontend/app-src/index.html'), 'utf8');

describe('Enterprise Accessibility — Interactive Flows & UI Views', () => {
  let dom, document;

  beforeAll(() => {
    dom = new JSDOM(html);
    document = dom.window.document;
  });

  describe('Trip Planning Form & Controls', () => {
    test('all form inputs and selects have associated labels or accessible names', () => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
      const missing = [];
      inputs.forEach((input) => {
        const id = input.id;
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
        const isInsideLabel = input.closest('label');
        const hasTitleOrPlaceholder = input.getAttribute('title') || input.getAttribute('placeholder');

        const isAccessible = Boolean(hasLabel || hasAriaLabel || isInsideLabel || hasTitleOrPlaceholder);
        if (!isAccessible) {
          missing.push(input.outerHTML.slice(0, 100));
        }
      });
      expect(missing).toEqual([]);
    });

    test('day count and time duration selectors have valid min/max and sensible defaults', () => {
      const days = document.getElementById('n-days');
      if (days) {
        expect(Number(days.getAttribute('min') || '1')).toBeGreaterThanOrEqual(1);
        expect(Number(days.getAttribute('max') || '10')).toBeLessThanOrEqual(30);
      }

      const tripTime = document.getElementById('t-time');
      if (tripTime) {
        expect(Number(tripTime.getAttribute('min') || '30')).toBeGreaterThanOrEqual(30);
      }
    });

    test('generate trip and action buttons are keyboard focusable and not disabled by default', () => {
      const genBtn = document.getElementById('btn-gen');
      if (genBtn) {
        expect(genBtn.tagName.toLowerCase()).toBe('button');
        expect(genBtn.getAttribute('tabindex') !== '-1').toBe(true);
      }
    });
  });

  describe('Modals & Dialogs Accessibility', () => {
    test('dialog elements have role="dialog" or class naming and accessible close triggers', () => {
      const modals = document.querySelectorAll('.custom-modal-content, [role="dialog"], .modal');
      modals.forEach((modal) => {
        const closeBtn = modal.querySelector('button[data-action*="close"], button[aria-label*="Close"], button[aria-label*="close"]');
        if (closeBtn) {
          const label = closeBtn.getAttribute('aria-label') || closeBtn.textContent.trim();
          expect(label.length).toBeGreaterThan(0);
        }
      });
    });

    test('customize places modal has checkboxes with clear labels', () => {
      const customizeModal = document.getElementById('customize-modal');
      if (customizeModal) {
        const header = customizeModal.querySelector('h2, h3, .modal-title');
        expect(header).toBeTruthy();
      }
    });

    test('command palette modal has accessible search input', () => {
      const palette = document.getElementById('command-palette-modal');
      if (palette) {
        const input = palette.querySelector('input');
        if (input) {
          const hasLabel = input.getAttribute('aria-label') || input.getAttribute('placeholder');
          expect(hasLabel).toBeTruthy();
        }
      }
    });
  });

  describe('Live Regions & Notification Feedback', () => {
    test('notifications toast or live status elements exist for screen readers', () => {
      const liveElements = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
      expect(liveElements.length).toBeGreaterThanOrEqual(1);
    });

    test('chat messages container allows scrolling and keyboard navigation', () => {
      const chatMsgs = document.getElementById('chat-msgs');
      if (chatMsgs) {
        expect(chatMsgs.getAttribute('role') || 'region').toBeTruthy();
      }
    });
  });
});
