/* global L */
/**
 * frontend/app-src/src/modules/routeAlternativesUi.js
 *
 * Google Maps-Grade Interactive Route Alternatives & Road Closure HUD.
 * Provides:
 * 1. Interactive Route Choice Chips (Fastest, Shortest, Alternates with time deltas).
 * 2. Multi-Polyline Leaflet Map Rendering (Active highlighted in accent, Alternates in slate grey).
 * 3. Click-to-switch route on both chips and map polylines.
 * 4. Visual Road Closure Indicators (⛔ / 🚧) with diversion popups.
 */

import { emit } from '../platform/eventBus.js';

let _activeRouteData = null;
let _currentActiveIdx = 0;
let _mapPolylines = [];
let _closureMarkers = [];
let _onRouteSelectCb = null;

/**
 * Escapes HTML characters safely.
 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the Google Maps-style Route Selection HUD chips.
 *
 * @param {HTMLElement} containerEl
 * @param {Object} routeData - Canonical route response containing .routes array
 * @param {Function} [onSelect] - Callback when user switches route
 */
export function renderRouteAlternativesHud(containerEl, routeData, onSelect = null) {
  if (!containerEl) return;
  _activeRouteData = routeData;
  _currentActiveIdx = routeData.activeRouteIndex || 0;
  _onRouteSelectCb = onSelect;

  const routes = Array.isArray(routeData.routes) && routeData.routes.length > 0
    ? routeData.routes
    : [routeData];

  // Remove previous alternatives HUD if exists
  const existingHud = document.getElementById('route-alternatives-hud');
  if (existingHud) existingHud.remove();

  // If only 1 route and no closure alert, no need for selection chips
  if (routes.length <= 1 && !routeData.closureAlert && !routeData.hasClosure) {
    return;
  }

  const hud = document.createElement('div');
  hud.id = 'route-alternatives-hud';
  hud.className = 'route-alternatives-hud';
  hud.setAttribute('role', 'region');
  hud.setAttribute('aria-label', 'Route alternatives selection');

  // Closure banner if rerouted or closure detected
  let alertHtml = '';
  if (routeData.closureAlert || routeData.hasClosure) {
    const alert = routeData.closureAlert || routeData.closureDetails || {};
    alertHtml = `
      <div class="route-closure-alert-banner">
        <span class="route-closure-icon">⛔</span>
        <div class="route-closure-content">
          <strong>${esc(alert.title || alert.closureName || 'Road Restriction Active')}</strong>
          <p>${esc(alert.alertMessage || alert.reason || 'Road segment is restricted. Safe alternate route selected.')}</p>
        </div>
      </div>
    `;
  }

  // Route choice chips
  const chipsHtml = routes.map((r, idx) => {
    const isSelected = idx === _currentActiveIdx;
    const isClosed = Boolean(r.hasClosure);
    const durationText = r.duration?.formatted || `${r.duration?.trafficAwareMinutes || r.duration?.minutes || 10} mins`;
    const distText = r.distance?.formatted || `${r.distance?.kilometers || 0} km`;
    const deltaText = r.timeDeltaFormatted || (r.isFastest ? 'Fastest' : '');

    let badgeClass = 'route-chip-badge';
    let badgeText = deltaText;
    if (isClosed) {
      badgeClass += ' badge-closed';
      badgeText = '⛔ Closed';
    } else if (r.isFastest) {
      badgeClass += ' badge-fastest';
      badgeText = 'Fastest';
    }

    return `
      <button type="button" class="route-choice-chip ${isSelected ? 'is-selected' : ''} ${isClosed ? 'is-closed' : ''}" data-route-idx="${idx}" title="${esc(r.summary)}">
        <div class="route-chip-header">
          <span class="route-chip-duration">${durationText}</span>
          ${badgeText ? `<span class="${badgeClass}">${badgeText}</span>` : ''}
        </div>
        <div class="route-chip-meta">
          <span class="route-chip-dist">${distText}</span>
          <span class="route-chip-summary">${esc(r.baseSummary || r.summary)}</span>
        </div>
      </button>
    `;
  }).join('');

  hud.innerHTML = `
    ${alertHtml}
    <div class="route-chips-scroll-container">
      ${chipsHtml}
    </div>
  `;

  // Attach click listeners to chips
  hud.querySelectorAll('.route-choice-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.routeIdx, 10);
      if (!Number.isNaN(idx)) {
        selectRouteOption(idx);
      }
    });
  });

  // Insert above or inside target container
  containerEl.appendChild(hud);
}

/**
 * Renders multiple route polylines on the Leaflet map:
 * - Selected route in vivid primary accent color
 * - Alternate routes in subtle slate grey with click-to-select
 * - Red alert markers on closed segments
 *
 * @param {Object} map - Leaflet map instance
 * @param {Object} routeData - Canonical route response
 * @param {number} activeIdx - Currently selected route index
 * @param {Function} [onSelect] - Callback when clicking an alternate polyline
 */
export function renderRoutePolylinesOnMap(map, routeData, activeIdx = 0, onSelect = null) {
  if (!map || typeof L === 'undefined') return;
  clearMapPolylines(map);

  const routes = Array.isArray(routeData.routes) && routeData.routes.length > 0
    ? routeData.routes
    : [routeData];

  _currentActiveIdx = activeIdx;
  _onRouteSelectCb = onSelect;

  // Render alternate routes first (so active route is drawn on top)
  routes.forEach((r, idx) => {
    if (idx === _currentActiveIdx) return;
    const geom = r.geometry || (r.route && r.route.geometry);
    if (!Array.isArray(geom) || geom.length < 2) return;

    const isClosed = Boolean(r.hasClosure);
    const polyline = L.polyline(geom, {
      color: isClosed ? '#ef4444' : '#64748b',
      weight: 4,
      opacity: isClosed ? 0.75 : 0.60,
      dashArray: isClosed ? '6, 6' : null,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Hover effect
    polyline.on('mouseover', () => {
      polyline.setStyle({ opacity: 0.95, weight: 6 });
    });
    polyline.on('mouseout', () => {
      polyline.setStyle({ opacity: isClosed ? 0.75 : 0.60, weight: 4 });
    });

    // Click to select
    polyline.on('click', () => {
      selectRouteOption(idx);
    });

    _mapPolylines.push({ polyline, index: idx });
  });

  // Render active route on top
  const activeRoute = routes[_currentActiveIdx] || routes[0];
  const activeGeom = activeRoute.geometry || (activeRoute.route && activeRoute.route.geometry);
  if (Array.isArray(activeGeom) && activeGeom.length >= 2) {
    const isClosed = Boolean(activeRoute.hasClosure);
    const activePolyline = L.polyline(activeGeom, {
      color: isClosed ? '#ef4444' : '#00c8f0',
      weight: 6,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    _mapPolylines.push({ polyline: activePolyline, index: _currentActiveIdx });

    // Fit map bounds
    if (typeof activePolyline.getBounds === 'function' && activePolyline.getBounds().isValid && activePolyline.getBounds().isValid()) {
      try {
        map.fitBounds(activePolyline.getBounds(), { padding: [60, 100] });
      } catch (_e) {}
    }
  }

  // Render road closure markers on closed corridors
  routes.forEach((r) => {
    if (r.hasClosure && r.closureDetails) {
      const details = r.closureDetails;
      const markerCoord = details.intersectionCoord || (details.bypassWaypoint ? details.bypassWaypoint : null);
      if (markerCoord && Number.isFinite(markerCoord[0])) {
        const iconHtml = `<div class="road-closure-marker-pin" title="${esc(details.name)}">⛔</div>`;
        const icon = L.divIcon({
          className: 'road-closure-leaflet-icon',
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const popupHtml = `
          <div class="closure-popup-content">
            <strong style="color:#ef4444;font-size:13px;">⛔ ${esc(details.name)}</strong>
            <div style="font-size:11px;margin:4px 0 6px 0;color:#cbd5e1;">${esc(details.reason)}</div>
            ${details.diversionAdvice ? `<div style="font-size:10px;padding:4px 8px;background:rgba(239,68,68,0.15);border-radius:4px;color:#fca5a5;"><strong>Advice:</strong> ${esc(details.diversionAdvice)}</div>` : ''}
          </div>
        `;

        const marker = L.marker(markerCoord, { icon }).addTo(map).bindPopup(popupHtml);
        _closureMarkers.push(marker);
      }
    }
  });
}

/**
 * Programmatically selects a route option, updates UI chips, map polylines, and triggers callback.
 *
 * @param {number} routeIdx
 */
export function selectRouteOption(routeIdx) {
  if (!_activeRouteData) return;
  const routes = Array.isArray(_activeRouteData.routes) && _activeRouteData.routes.length > 0
    ? _activeRouteData.routes
    : [_activeRouteData];

  if (routeIdx < 0 || routeIdx >= routes.length) return;
  _currentActiveIdx = routeIdx;
  const selected = routes[routeIdx];

  // Update UI chips
  const hud = document.getElementById('route-alternatives-hud');
  if (hud) {
    hud.querySelectorAll('.route-choice-chip').forEach(btn => {
      const idx = parseInt(btn.dataset.routeIdx, 10);
      btn.classList.toggle('is-selected', idx === _currentActiveIdx);
    });
  }

  // Update Nav card elements if available
  const navDistEl = document.getElementById('nav-dist');
  const navEtaEl = document.getElementById('nav-eta');
  const navTurnEl = document.getElementById('nav-turn');

  if (navDistEl && selected.distance) {
    navDistEl.textContent = selected.distance.formatted || `${selected.distance.kilometers} km`;
  }
  if (navEtaEl && selected.duration) {
    navEtaEl.textContent = selected.duration.formatted || `${selected.duration.trafficAwareMinutes} mins`;
  }
  if (navTurnEl && Array.isArray(selected.steps) && selected.steps[0]?.instruction) {
    navTurnEl.textContent = `Next: ${selected.steps[0].instruction}`;
  }

  // Trigger callback
  if (typeof _onRouteSelectCb === 'function') {
    _onRouteSelectCb(routeIdx, selected);
  }

  emit('routing:routeSelected', { routeIndex: routeIdx, route: selected });
}

/**
 * Clears map polylines and closure markers.
 *
 * @param {Object} map
 */
export function clearMapPolylines(map) {
  if (map) {
    _mapPolylines.forEach(item => {
      if (item.polyline) map.removeLayer(item.polyline);
    });
    _closureMarkers.forEach(m => {
      map.removeLayer(m);
    });
  }
  _mapPolylines = [];
  _closureMarkers = [];
}
