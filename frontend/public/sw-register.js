/* Service worker registration — external so CSP script-src 'self' allows it */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=20260801-v4', { updateViaCache: 'none' })
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));

    let reloadedForNewWorker = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForNewWorker) return;
      reloadedForNewWorker = true;
      window.location.reload();
    });
  });
}
