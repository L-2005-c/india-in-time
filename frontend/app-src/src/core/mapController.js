// frontend/app-src/src/core/mapController.js
// Leaflet map initialization, MapTiler + OpenStreetMap multi-tier tile failover,
// markers rendering, polyline routes, GPS tracking and Live Navigation
'use strict';

import { hvKm, isFiniteLatLon, hasValidCoords } from '../utils/geo.js';
import { showToast } from '../modules/notifications.js';
import { browserLogger } from '../utils/browser-logger.js';

export function createMapController(ctx) {
  const {
    getState,
    setState,
    installLeafletSafetyGuards,
  } = ctx;

  let markerAnimFrame = null;
  const NAV_CARD_COLLAPSED_KEY = 'iit_nav_card_collapsed';
  const COMPASS_DIRS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];

  // Map tile sources with clean OpenStreetMap and MapTiler support
  const TILE_SOURCES = [
    {
      name: 'openstreetmap-standard',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19,
        keepBuffer: 4,
      },
    },
    {
      name: 'openstreetmap-subdomains',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19,
        subdomains: 'abc',
        keepBuffer: 4,
      },
    },
    {
      name: 'carto-voyager',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      opts: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        subdomains: 'abcd',
        keepBuffer: 4,
      },
    },
  ];

  let tileSourceIdx = 0;
  let tileErrorCount = 0;
  let tileErrorWindowStart = Date.now();
  const TILE_ERROR_THRESHOLD = 6;
  const TILE_ERROR_WINDOW_MS = 10000;

  function buildTileLayer(idx) {
    const src = TILE_SOURCES[Math.min(idx, TILE_SOURCES.length - 1)];
    return L.tileLayer(src.url, src.opts);
  }

  function attachTileErrorHandling(layer) {
    layer.on('tileerror', (e) => {
      const tile = e.tile;
      const originalSrc = e.tile?.src;
      const attempts = tile?._iitRetryCount || 0;
      if (attempts < 2 && originalSrc) {
        tile._iitRetryCount = attempts + 1;
        setTimeout(() => { try { tile.src = originalSrc; } catch (_e) {} }, 800 * (attempts + 1));
      } else if (tile) {
        try { tile.style.visibility = 'hidden'; } catch (_e) {}
      }

      const now = Date.now();
      if (now - tileErrorWindowStart > TILE_ERROR_WINDOW_MS) {
        tileErrorCount = 0;
        tileErrorWindowStart = now;
      }
      tileErrorCount++;
      if (tileErrorCount > TILE_ERROR_THRESHOLD && tileSourceIdx < TILE_SOURCES.length - 1) {
        switchTileLayer(tileSourceIdx + 1);
        browserLogger.warn('[map] Primary tile source struggling, switched to fallback basemap.');
      }
    });
  }

  function switchTileLayer(idx) {
    const state = getState();
    if (!state.map) return;
    tileSourceIdx = idx;
    tileErrorCount = 0;
    tileErrorWindowStart = Date.now();
    const newLayer = buildTileLayer(tileSourceIdx);
    attachTileErrorHandling(newLayer);
    newLayer.addTo(state.map);
    if (window._tileLayer) {
      try { state.map.removeLayer(window._tileLayer); } catch (_e) {}
    }
    window._tileLayer = newLayer;
  }

  async function pickWorkingMaptilerKeys(keys) {
    const probe = k => fetch(`https://api.maptiler.com/maps/streets-v2/0/0/0.png?key=${k}`, { method: 'GET', cache: 'no-store' })
      .then(r => r.ok ? k : null)
      .catch(() => null);
    const results = await Promise.all(keys.map(probe));
    return results.filter(Boolean);
  }

  function initMap() {
    const state = getState();
    try {
      if (installLeafletSafetyGuards) {
        installLeafletSafetyGuards(typeof L !== 'undefined' ? L : window.L);
      }
      state.map = L.map('map', {
        zoomControl: false,
        zoomSnap: 1,
        zoomDelta: 1,
        wheelPxPerZoomLevel: 120,
      }).setView([20.5937, 78.9629], 5);

      L.control.zoom({ position: 'topleft' }).addTo(state.map);

      // Start with initial clean tile layer
      window._tileLayer = buildTileLayer(0);
      attachTileErrorHandling(window._tileLayer);
      window._tileLayer.addTo(state.map);

      // Check URL search params for key (e.g. ?maptiler_key=... or ?key=...)
      let urlKeys = [];
      try {
        const params = new URLSearchParams(window.location.search);
        const urlKey = params.get('maptiler_key') || params.get('key') || window.MAPTILER_KEY;
        if (urlKey) urlKeys.push(urlKey);
      } catch (_e) {}

      // Fetch server configured MapTiler keys from /api/config
      fetch('/api/config')
        .then(r => r.json())
        .then(async cfg => {
          const serverKeys = cfg && Array.isArray(cfg.maptilerKeys) ? cfg.maptilerKeys.filter(Boolean) : [];
          const allKeys = [...urlKeys, ...serverKeys];
          if (allKeys.length) {
            const working = await pickWorkingMaptilerKeys(allKeys);
            const usableKeys = working.length ? working : allKeys;
            if (usableKeys.length) {
              browserLogger.info(`[map] MapTiler key verified. Adding MapTiler streets-v2 to primary basemap.`);
              for (let i = usableKeys.length - 1; i >= 0; i--) {
                TILE_SOURCES.unshift({
                  name: `maptiler-${i}`,
                  url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${usableKeys[i]}`,
                  opts: {
                    attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
                    maxZoom: 19,
                    keepBuffer: 4,
                  },
                });
              }
              switchTileLayer(0);
            }
          }
        })
        .catch(err => {
          browserLogger.warn('[map] /api/config fetch error, staying on OpenStreetMap basemap:', err);
        });

      [0, 150, 400, 900].forEach(delay => setTimeout(() => { if (state.map) state.map.invalidateSize(false); }, delay));
      const mapEl = document.getElementById('map');
      if (mapEl && 'ResizeObserver' in window) {
        new ResizeObserver(() => { if (state.map) state.map.invalidateSize(false); }).observe(mapEl);
      }
      window.addEventListener('resize', () => { if (state.map) state.map.invalidateSize(); });
    } catch (err) {
      browserLogger.error('[map] Failed to initialize Leaflet map:', err);
    }
  }

  function degToCompassLabel(deg) {
    return COMPASS_DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }

  function compassTap() {
    const state = getState();
    if (state.lastHeading == null) {
      showToast('🧭', 'Direction', 'Start moving or begin live navigation to detect your heading.');
      return;
    }
    const deg = Math.round(((state.lastHeading % 360) + 360) % 360);
    showToast('🧭', 'Heading', `${degToCompassLabel(state.lastHeading)} (${deg}°)`);
  }

  function updateFollowButton() {
    const state = getState();
    const btn = document.getElementById('btn-follow-live');
    if (!btn) return;
    btn.textContent = state.autoFollowLive ? '🎯 Following' : '🧭 Follow Me';
    btn.style.opacity = state.autoFollowLive ? '1' : '0.85';
  }

  function toggleLiveFollow(forceState) {
    const state = getState();
    state.autoFollowLive = typeof forceState === 'boolean' ? forceState : !state.autoFollowLive;
    updateFollowButton();
    if (state.autoFollowLive) followLivePosition(true);
  }

  function toggleNavCardCollapsed(forceState) {
    const card = document.getElementById('nav-card');
    const btn = document.getElementById('nav-card-collapse-btn');
    if (!card) return;
    const collapsed = typeof forceState === 'boolean' ? forceState : !card.classList.contains('collapsed');
    card.classList.toggle('collapsed', collapsed);
    if (btn) {
      btn.textContent = collapsed ? '▸' : '▾';
      btn.setAttribute('aria-label', collapsed ? 'Expand live navigation' : 'Minimize live navigation');
    }
    try { localStorage.setItem(NAV_CARD_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (_e) {}
  }

  function restoreNavCardCollapsed() {
    let wasCollapsed = false;
    try { wasCollapsed = localStorage.getItem(NAV_CARD_COLLAPSED_KEY) === '1'; } catch (_e) {}
    if (wasCollapsed) toggleNavCardCollapsed(true);
  }

  function followLivePosition(force = false) {
    const state = getState();
    if (!state.map || !isFiniteLatLon(state.cLat, state.cLon)) return;
    if (!force && (!state.tripActive || !state.autoFollowLive)) return;
    const zoom = Math.max(state.map.getZoom() || 14, 15);
    try {
      state.map.stop();
      state.map.setView([state.cLat, state.cLon], zoom, { animate: true });
    } catch (_e) {}
  }

  function animateLiveMarkerTo(lat, lon) {
    const state = getState();
    if (!isFiniteLatLon(lat, lon)) return;
    if (!state.liveMkr) { state.displayedLat = lat; state.displayedLon = lon; return; }
    if (markerAnimFrame) cancelAnimationFrame(markerAnimFrame);
    const fromLat = Number.isFinite(state.displayedLat) ? state.displayedLat : lat;
    const fromLon = Number.isFinite(state.displayedLon) ? state.displayedLon : lon;
    const distM = hvKm(fromLat, fromLon, lat, lon) * 1000;
    if (!Number.isFinite(distM) || distM < 0.5 || distM > 150) {
      state.displayedLat = lat;
      state.displayedLon = lon;
      try { state.liveMkr.setLatLng([lat, lon]); } catch (_e) {}
      return;
    }
    const duration = 400;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      state.displayedLat = fromLat + (lat - fromLat) * eased;
      state.displayedLon = fromLon + (lon - fromLon) * eased;
      if (isFiniteLatLon(state.displayedLat, state.displayedLon)) {
        try { state.liveMkr.setLatLng([state.displayedLat, state.displayedLon]); } catch (_e) {}
      }
      if (t < 1) markerAnimFrame = requestAnimationFrame(step);
      else markerAnimFrame = null;
    };
    markerAnimFrame = requestAnimationFrame(step);
  }

  function snapToRoute(lat, lon) {
    const state = getState();
    if (!isFiniteLatLon(lat, lon) || !state.rLine) return [lat, lon];
    let latlngs = state.rLine.getLatLngs();
    if (!latlngs || !latlngs.length) return [lat, lon];
    if (Array.isArray(latlngs[0])) latlngs = latlngs.flat(Infinity);
    if (latlngs.length < 2) return [lat, lon];
    return [lat, lon];
  }

  function clearMarkers() {
    const state = getState();
    if (Array.isArray(state.mkrs)) {
      state.mkrs.forEach(m => { try { state.map.removeLayer(m); } catch (_e) {} });
    }
    state.mkrs = [];
  }

  function renderMapMarkers() {
    const state = getState();
    if (!state.map) return;
    clearMarkers();
    const pool = state.itin?.length ? state.itin : (state.LOCS || []);
    pool.forEach((loc, i) => {
      if (!hasValidCoords(loc.coords)) return;
      const [lat, lon] = loc.coords;
      const isItin = state.itin?.length > 0;
      const markerHtml = `
        <div class="iit-marker-pin ${isItin ? 'active' : ''}" style="background:var(--brand-primary,#2563eb);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.5);border:2px solid #fff;">
          ${isItin ? i + 1 : '📍'}
        </div>
      `;
      const icon = L.divIcon({
        className: 'iit-custom-marker',
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const mkr = L.marker([lat, lon], { icon }).addTo(state.map);
      mkr.bindPopup(`<strong>${loc.name}</strong><br>${loc.cat ? loc.cat.toUpperCase() : ''}`);
      state.mkrs.push(mkr);
    });
  }

  function drawRouteLine(coords) {
    const state = getState();
    if (!state.map) return;
    if (state.rLine) {
      try { state.map.removeLayer(state.rLine); } catch (_e) {}
    }
    if (!coords || coords.length < 2) return;
    state.rLine = L.polyline(coords, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.85,
      smoothFactor: 1,
    }).addTo(state.map);
  }

  return {
    initMap,
    compassTap,
    updateFollowButton,
    toggleLiveFollow,
    toggleNavCardCollapsed,
    restoreNavCardCollapsed,
    followLivePosition,
    animateLiveMarkerTo,
    snapToRoute,
    clearMarkers,
    renderMapMarkers,
    drawRouteLine,
  };
}
