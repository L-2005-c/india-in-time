import { setOnline } from '../state/appState.js';
import { showToast } from '../modules/notifications.js';
let wired = false;
export function initConnectivityObserver() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', () => {
    setOnline(true);
    showToast('🟢', 'Back online', 'Connection restored. Re-syncing journey & alerts...', 3000);
    window.dispatchEvent(new CustomEvent('iit:online-resync', { detail: { timestamp: Date.now() } }));
    if (typeof window.refreshAlertsView === 'function') window.refreshAlertsView();
    if (typeof window.refreshChatAssistantView === 'function') window.refreshChatAssistantView();
  });
  window.addEventListener('offline', () => {
    setOnline(false);
    showToast('🟠', 'Offline', 'Showing cached journey data. Last verified state preserved.', 5000);
    window.dispatchEvent(new CustomEvent('iit:offline-transition', { detail: { timestamp: Date.now() } }));
    if (typeof window.refreshAlertsView === 'function') window.refreshAlertsView();
  });
  setOnline(navigator.onLine);
}
