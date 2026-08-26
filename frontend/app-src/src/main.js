/**
 * v4 boot — platform services + domain modules.
 */
import { browserLogger } from './utils/browser-logger.js';
import { ensureFocusVisibleStyles, announce } from './a11y/helpers.js';
import { initializeThemeSystem } from './design/theme.js';
import { state } from './state/appState.js';
import * as modules from './modules/index.js';
import { initConnectivityObserver } from './utils/connectivity.js';
import { hydrateFlagsFromServer } from './platform/featureFlags.js';
import { mark, reportNavigationTiming } from './platform/perf.js';
import { emit } from './platform/eventBus.js';
import './core/app.js';

if (typeof document !== 'undefined') {
  const boot = async () => {
    try {
      mark('boot-start');
      initializeThemeSystem();
      ensureFocusVisibleStyles();
      initConnectivityObserver();
      await hydrateFlagsFromServer();
      window.__a11yAnnounce = announce;
      window.__appState = state;
      window.__modules = modules;
      window.__experienceScore = modules.experienceScore || null;
      window.__travelTime = modules.travelTime || null;
      window.__sunTimes = modules.sunTimes || null;
      mark('boot-ready');
      emit('app:ready', { timing: reportNavigationTiming() });
    } catch (e) {
      browserLogger.warn('[v4-boot] failed', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
