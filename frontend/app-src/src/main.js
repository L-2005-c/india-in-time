import { browserLogger } from '../utils/browser-logger.js';
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
      window.__modules = modules;
      window.__experienceScore = modules.experienceScore || null;
      window.__travelTime = modules.travelTime || null;
      window.__sunTimes = modules.sunTimes || null;
    } catch (e) {
      browserLogger.warn('[enterprise-boot] failed', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
