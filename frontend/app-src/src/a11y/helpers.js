/**
 * Accessibility helpers for dynamically generated UI.
 */
export function a11yButtonAttrs(label, { pressed, expanded, controls } = {}) {
  const parts = [`role="button"`, `tabindex="0"`];
  if (label) parts.push(`aria-label="${escapeAttr(label)}"`);
  if (pressed != null) parts.push(`aria-pressed="${pressed ? 'true' : 'false'}"`);
  if (expanded != null) parts.push(`aria-expanded="${expanded ? 'true' : 'false'}"`);
  if (controls) parts.push(`aria-controls="${escapeAttr(controls)}"`);
  return parts.join(' ');
}

export function a11yLiveRegion(politeness = 'polite') {
  return `role="status" aria-live="${politeness}" aria-atomic="true"`;
}

export function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Announce a short message to screen readers via a live region. */
export function announce(message, { politeness = 'polite' } = {}) {
  let el = document.getElementById('a11y-announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'a11y-announcer';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0';
    document.body.appendChild(el);
  }
  el.textContent = '';
  // Force re-announce even if same text
  requestAnimationFrame(() => { el.textContent = String(message || ''); });
}

// Focus-visible / sr-only / role=button styling now lives statically in
// styles.css (see :focus-visible, .sr-only, [role="button"]) instead of being
// injected here as a <style> block — a dynamically-created <style> element's
// textContent is governed by the style-src CSP directive (not style-src-attr,
// which already allows 'unsafe-inline' for style="" attributes), and without
// an 'unsafe-inline'/hash/nonce for style-src this got silently CSP-blocked
// on every page load. Kept as a no-op so existing callers don't need to change.
export function ensureFocusVisibleStyles() {}
