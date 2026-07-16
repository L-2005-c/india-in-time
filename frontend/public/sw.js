// ─────────────────────────────────────────────
//  India In-Time — Service Worker (sw.js)
//  Enables offline mode + fast loading
// ─────────────────────────────────────────────

const CACHE_NAME = 'india-in-time-v12-map-contrast-fix';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/client-api.js?v=20260603-vercel-fix',
  '/logo-mark.png?v=20260603-logo',
  '/favicon-32.png?v=20260603-logo',
  '/apple-touch-icon.png?v=20260603-logo',
  '/icon-192.png?v=20260603-logo',
  '/icon-512.png?v=20260603-logo',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Space+Mono:wght@400;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ── Install: cache static assets ─────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for static, network-first for API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and chrome-extension URLs
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Always go to network for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — API unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // For the app shell and branding assets, always prefer the latest version.
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/client-api.js'
      || url.pathname === '/logo-mark.png' || url.pathname === '/favicon-32.png'
      || url.pathname === '/apple-touch-icon.png' || url.pathname === '/icon-192.png'
      || url.pathname === '/icon-512.png' || url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // For Firebase requests — always network
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // For everything else — cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return cached index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html').then(r => r || new Response('Offline', { status: 503 }));
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── Push Notifications (for closing time alerts) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'India In-Time', {
      body: data.body || '',
      icon: '/icon-192.png?v=20260603-logo',
      badge: '/icon-192.png?v=20260603-logo',
      vibrate: [200, 100, 200],
    })
  );
});