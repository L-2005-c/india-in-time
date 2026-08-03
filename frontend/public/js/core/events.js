// ══════════════════════════════════════════════════
// Unified event delegation system
// Extends the existing data-action delegation pattern (CHAT_ACTIONS +
// STATIC_ACTIONS) into a single, extensible registry. Each view module
// registers its own actions via registerAction() at import time.
//
// This is the key XSS fix: every onclick="fn()" in JS-built HTML
// becomes data-action="fn" and registers through this module.
// ══════════════════════════════════════════════════

/** @type {Record<string, (el: HTMLElement) => void>} */
const ACTION_TABLE = {};

/**
 * Register a named action handler.
 * @param {string} name  — matches data-action="name" in the DOM
 * @param {(el: HTMLElement) => void} handler
 */
export function registerAction(name, handler) {
  if (ACTION_TABLE[name]) {
    console.warn(`[events] Overwriting existing action: "${name}"`);
  }
  ACTION_TABLE[name] = handler;
}

/**
 * Register multiple actions at once.
 * @param {Record<string, (el: HTMLElement) => void>} map
 */
export function registerActions(map) {
  for (const [name, handler] of Object.entries(map)) {
    registerAction(name, handler);
  }
}

/**
 * Dispatch a data-action click. Looks up the handler by name and calls it.
 * Returns true if a handler was found and executed.
 */
export function dispatchAction(name, el) {
  const fn = ACTION_TABLE[name];
  if (fn) { fn(el); return true; }
  return false;
}

/**
 * Initialize global event delegation listeners on document.
 * Call this once during boot (from init.js or app.js).
 */
export function initEventDelegation() {
  // ── Click delegation ────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const fn = ACTION_TABLE[btn.dataset.action];
    if (fn) fn(btn);
  });

  // ── Keyboard activation for role="button" elements ──────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[role="button"][data-action]');
    if (!el) return;
    e.preventDefault();
    const fn = ACTION_TABLE[el.dataset.action];
    if (fn) fn(el);
  });

  // ── Change delegation (city select) ─────────────────────────────────────
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action="switchCity"]');
    if (el && el.value) {
      const fn = ACTION_TABLE['switchCity'];
      if (fn) fn(el);
    }

    // File inputs use data-action for registration but fire on 'change'
    const fileEl = e.target.closest('input[type="file"][data-action]');
    if (fileEl) {
      const fn = ACTION_TABLE[fileEl.dataset.action];
      if (fn) fn(fileEl);
    }
  });

  // ── Input delegation (time slider) ──────────────────────────────────────
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action="onTimeSliderChange"]');
    if (el) {
      const fn = ACTION_TABLE['onTimeSliderChange'];
      if (fn) fn(el);
    }

    // Budget inputs with oninput delegation
    const budgetEl = e.target.closest('[data-action="updateBudget"]');
    if (budgetEl) {
      const fn = ACTION_TABLE['updateBudget'];
      if (fn) fn(budgetEl);
    }
  });
}
