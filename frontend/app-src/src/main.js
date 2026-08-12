// Entry point — Vite module graph starts here.
import { ensureFocusVisibleStyles, announce } from './a11y/helpers.js';
import { state } from './state/appState.js';
import * as modules from './modules/index.js';
import './core/app.js';

if (typeof document !== 'undefined') {
  const boot = () => {
    try {
      ensureFocusVisibleStyles();
      window.__a11yAnnounce = announce;
      window.__appState = state;
      window.__modules = modules; // enterprise module surface for gradual adoption
    } catch (e) {
      console.warn('[enterprise-boot] failed', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
