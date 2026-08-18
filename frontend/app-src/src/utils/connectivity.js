import { setOnline } from '../state/appState.js';
import { showToast } from '../modules/notifications.js';
let wired = false;
export function initConnectivityObserver() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', () => { setOnline(true); showToast('🟢', 'Back online', 'Connection restored.', 3000); });
  window.addEventListener('offline', () => { setOnline(false); showToast('🟠', 'Offline', 'Some features may be limited until you reconnect.', 5000); });
  setOnline(navigator.onLine);
}
