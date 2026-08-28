// frontend/app-src/src/core/mapController.js
// Leaflet map initialization, markers rendering, polyline routes, GPS and Live Navigation
'use strict';

import { hvKm, isFiniteLatLon, hasValidCoords } from '../utils/geo.js';
import { showToast } from '../modules/notifications.js';

export function createMapController(ctx) {
  const {
    getState,
    setState,
    installLeafletSafetyGuards,
  } = ctx;

  let markerAnimFrame = null;
  const NAV_CARD_COLLAPSED_KEY = 'iit_nav_card_collapsed';
  const COMPASS_DIRS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];

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
