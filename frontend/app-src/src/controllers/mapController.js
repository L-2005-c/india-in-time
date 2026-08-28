/**
 * frontend/app-src/src/controllers/mapController.js
 * Leaflet map instance lifecycle, marker layers, polyline rendering, and OSRM road route fetching.
 */

import { browserLogger } from '../utils/browser-logger.js';
import { hasValidCoords, hvKm } from '../utils/geo.js';
import { turnArrowForInstruction } from '../utils/nav-route.js';

export const ROAD_ROUTE_MIRRORS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/'
];

export function createMapController({
  getMap,
  setRoutePolyline,
  getRoutePolyline,
  calculateExperienceScore,
  escapeHtml,
  fmtM,
  getRouteStopsForDay,
  recalcTimes,
  syncState,
  updateItinUI,
  maybeSpeakNavInstruction,
  applyMapHeadingRotation,
  setupStreetQuest
}) {
  let allPlacesMkrs = [];
  let mkrs = [];

  function clearAllMarkers() {
    const map = getMap();
    if (map) {
      allPlacesMkrs.forEach(mk => map.removeLayer(mk));
      mkrs.forEach(mk => map.removeLayer(mk));
    }
    allPlacesMkrs = [];
    mkrs = [];
  }

  function renderMapMarkers() {
    const map = getMap();
    if (!map) return;
    if (window.tripActive || (window.itin && window.itin.length > 0)) {
      allPlacesMkrs.forEach(mk => map.removeLayer(mk));
      allPlacesMkrs = [];
      return;
    }

    allPlacesMkrs.forEach(mk => map.removeLayer(mk));
    allPlacesMkrs = [];

    if (!window.LOCS || !window.LOCS.length) return;

    window.LOCS.forEach(l => {
      if (!hasValidCoords(l.coords)) return;

      if (l.isHiddenGem) {
        const ic = window.L.divIcon({
          className: 'iit-marker',
          html: `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#a855f7,#6d28d9);border-radius:50% 50% 50% 0;transform:rotate(45deg);border:2px solid #fff;animation:gempulse 1.8s ease-in-out infinite;"><span style="transform:rotate(-45deg);font-size:12px;">💎</span></div>`,
          iconSize: [26, 26], iconAnchor: [13, 20]
        });
        const gemPopup = `
          <div style="min-width:200px;">
            <b>💎 ${l.name}</b> <span style="background:#a855f7;color:#fff;font-size:9px;padding:1px 6px;border-radius:4px;">HIDDEN GEM</span>
            <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
            <div style="font-size:11px;line-height:1.4;margin-bottom:6px;">${l.why || ''}</div>
            <div style="font-size:10px;color:var(--text-muted);font-style:italic;">${l.reviewGap || ''}</div>
          </div>`;
        allPlacesMkrs.push(window.L.marker(l.coords, { icon: ic }).addTo(map).bindPopup(gemPopup));
        return;
      }

      const exp = calculateExperienceScore(l, window.globalSimulationTime);
      let expCol = '#6b7280';
      if (exp.score > 79) expCol = '#10b981';
      else if (exp.score > 59) expCol = '#f59e0b';
      else if (exp.score > 39) expCol = '#f97316';
      else if (exp.score > 0) expCol = '#ef4444';

      const size = 14;
      const shadow = 'rgba(0,0,0,0.3)';
      const ic = window.L.divIcon({ className: 'iit-marker', html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${expCol};border:2px solid #fff;box-shadow:0 0 8px ${shadow};"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

      const popupHtml = `
        <div style="min-width:180px;">
          <b>${l.name}</b><br>
          <small>${(l.cat || '').toUpperCase()}</small>
          <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="color:${expCol};font-size:16px;">Score: ${exp.score}/100</strong>
            <span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:10px;">${exp.state}</span>
          </div>
          <ul style="padding-left:16px;margin:0;font-size:11px;color:var(--text-muted);line-height:1.4;">
            ${exp.reasons.map(r => `<li>${r}</li>`).join('')}
          </ul>
          ${typeof window.getTimeBadgesHtml === 'function' ? window.getTimeBadgesHtml(l) : ''}
          ${typeof window.getTravelIntelPanelHtml === 'function' ? window.getTravelIntelPanelHtml(l) : ''}
        </div>
      `;
      const mkr = window.L.marker(l.coords, { icon: ic }).addTo(map).bindPopup(popupHtml);
      allPlacesMkrs.push(mkr);
    });
  }

  async function fetchRoadRoute(raw, { accent, tripActive, routeStops }) {
    if (!raw || raw.length < 2) return false;
    const map = getMap();
    let rLine = getRoutePolyline();
    let nsDist = '--';
    let nsEta = '--';
    try {
      let fullGeometry = null, distanceFormatted = null, durationFormatted = null, nextStepInstruction = null;
      if (raw.length === 2) {
        const res = await fetch(`/api/v1/routing/route?origin=${raw[0][0]},${raw[0][1]}&destination=${raw[1][0]},${raw[1][1]}&mode=driving`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const d = await res.json();
          if (d.success && Array.isArray(d.route?.geometry) && d.route.geometry.length >= 2) {
            fullGeometry = d.route.geometry;
            if (routeStops[0]) {
              routeStops[0].tt = d.duration?.trafficAwareMinutes || d.duration?.minutes || routeStops[0].tt;
              distanceFormatted = d.distance?.formatted || `${(d.distance?.kilometers || 0).toFixed(1)} km`;
              durationFormatted = d.duration?.formatted || fmtM(routeStops[0].tt);
            }
            if (d.route.steps?.[0]?.instruction) nextStepInstruction = d.route.steps[0].instruction;
          }
        }
      } else {
        const res = await fetch(`/api/v1/routing/matrix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stops: raw.map(c => ({ coords: c })), mode: 'driving' }), signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const d = await res.json();
          if (d.success && Array.isArray(d.legs) && d.legs.length > 0) {
            const geometries = [];
            d.legs.forEach((leg, idx) => {
              if (leg?.success && Array.isArray(leg.route?.geometry)) geometries.push(...leg.route.geometry);
              if (routeStops[idx] && leg?.duration) routeStops[idx].tt = leg.duration.trafficAwareMinutes || leg.duration.minutes || routeStops[idx].tt;
            });
            if (geometries.length >= 2) {
              fullGeometry = geometries;
              if (d.legs[0]?.distance?.formatted) { distanceFormatted = d.legs[0].distance.formatted; durationFormatted = d.legs[0].duration?.formatted || fmtM(routeStops[0]?.tt || 10); }
              if (d.legs[0]?.route?.steps?.[0]?.instruction) nextStepInstruction = d.legs[0].route.steps[0].instruction;
            }
          }
        }
      }
      if (fullGeometry && fullGeometry.length >= 2) {
        if (rLine && map) map.removeLayer(rLine);
        rLine = window.L.polyline(fullGeometry, { color: accent, weight: tripActive ? 7 : 4, opacity: tripActive ? 0.98 : 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
        setRoutePolyline(rLine);
        if (!tripActive && map && typeof map.fitBounds === 'function' && rLine.getBounds && typeof rLine.getBounds === 'function' && rLine.getBounds().isValid && rLine.getBounds().isValid()) {
          try { map.fitBounds(rLine.getBounds(), { padding: [60, 100] }); } catch (_e) {}
        }
        if (distanceFormatted) nsDist = distanceFormatted;
        if (durationFormatted) nsEta = durationFormatted;
        if (nextStepInstruction) {
          const navText = `Next: ${nextStepInstruction}`.trim();
          const turnEl = document.getElementById('nav-turn');
          if (turnEl) turnEl.textContent = navText;
          if (typeof maybeSpeakNavInstruction === 'function') maybeSpeakNavInstruction(navText);
        }
        const distEl = document.getElementById('nav-dist');
        const etaEl = document.getElementById('nav-eta');
        if (distEl) distEl.textContent = nsDist;
        if (etaEl) etaEl.textContent = nsEta;
        if (typeof applyMapHeadingRotation === 'function') applyMapHeadingRotation();
        return true;
      }
    } catch (_e) { /* fallback to client OSRM mirrors */ }

    const coords = raw.map(p => `${p[1]},${p[0]}`).join(';');
    for (let mIdx = 0; mIdx < ROAD_ROUTE_MIRRORS.length; mIdx++) {
      try {
        const res = await fetch(`${ROAD_ROUTE_MIRRORS[mIdx]}${coords}?overview=full&geometries=geojson&steps=true`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const d = await res.json();
        if (!d.routes?.[0]?.geometry?.coordinates) continue;
        const lc = d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (rLine && map) map.removeLayer(rLine);
        rLine = window.L.polyline(lc, { color: accent, weight: tripActive ? 7 : 4, opacity: tripActive ? 0.98 : 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
        setRoutePolyline(rLine);
        if (!tripActive && map && typeof map.fitBounds === 'function' && rLine.getBounds && typeof rLine.getBounds === 'function' && rLine.getBounds().isValid && rLine.getBounds().isValid()) {
          try { map.fitBounds(rLine.getBounds(), { padding: [60, 100] }); } catch (_e) {}
        }
        if (d.routes[0].legs?.[0]) {
          const activeLeg = d.routes[0].legs[0];
          if (routeStops[0]) routeStops[0].tt = Math.ceil(activeLeg.duration / 60);
          nsDist = ((activeLeg.distance || 0) / 1000).toFixed(1) + 'km';
          nsEta = fmtM(routeStops[0]?.tt || Math.ceil(activeLeg.duration / 60));
        }
        const ns = d.routes[0].legs[0]?.steps?.find(step => step?.name || step?.maneuver?.modifier || step?.maneuver?.type);
        if (ns) {
          const navText = `Next: ${(ns.maneuver?.modifier || ns.maneuver?.type || 'continue').replace(/_/g, ' ')}${ns.name ? ` via ${ns.name}` : ''}`.trim();
          const turnEl = document.getElementById('nav-turn');
          if (turnEl) turnEl.textContent = navText;
          if (typeof maybeSpeakNavInstruction === 'function') maybeSpeakNavInstruction(navText);
        }
        const distEl = document.getElementById('nav-dist');
        const etaEl = document.getElementById('nav-eta');
        if (distEl) distEl.textContent = nsDist;
        if (etaEl) etaEl.textContent = nsEta;
        if (typeof applyMapHeadingRotation === 'function') applyMapHeadingRotation();
        return true;
      } catch (e) { browserLogger.warn(`Road routing fallback failed:`, e); }
    }
    return false;
  }

  async function renderRoute() {
    const map = getMap();
    if (!map) return;
    let rLine = getRoutePolyline();
    mkrs.forEach(mk => map.removeLayer(mk));
    if (rLine) map.removeLayer(rLine);
    mkrs = [];

    const itin = window.itin || [];
    let routeStops = getRouteStopsForDay(itin);
    const tripActive = window.tripActive;

    if (!routeStops.length) {
      const nextEl = document.getElementById('nav-next');
      const turnEl = document.getElementById('nav-turn');
      const distEl = document.getElementById('nav-dist');
      const etaEl = document.getElementById('nav-eta');
      if (nextEl) nextEl.textContent = tripActive ? 'Trip Complete! 🎉' : 'Generate a plan above';
      if (turnEl) turnEl.textContent = tripActive ? 'All stops reached!' : 'Select preferences to start.';
      if (distEl) distEl.textContent = '--';
      if (etaEl) etaEl.textContent = '--';
      if (typeof updateItinUI === 'function') updateItinUI();
      return;
    }

    const routeStart = typeof window.getPreviewRouteStart === 'function' ? window.getPreviewRouteStart() : null;
    routeStops.forEach((s, i) => {
      if (!s.tt) {
        const prev = i === 0 ? routeStart : routeStops[i - 1]?.coords;
        const dKm = prev && hasValidCoords(prev) && hasValidCoords(s.coords) ? (hvKm(prev[0], prev[1], s.coords[0], s.coords[1]) * 1.42) : 2;
        s.tt = prev ? Math.max(6, Math.round(dKm / 0.32)) : 10;
      }
    });

    if (recalcTimes({ trimToWindow: true }) > 0) {
      syncState();
      routeStops = getRouteStopsForDay(window.itin || []);
    }
    routeStops = routeStops.filter(stop => hasValidCoords(stop.coords));
    if (!routeStops.length) return;

    const visibleStops = tripActive
      ? routeStops.filter((stop, i) => i === 0 || (i <= 2 && (!window.cLat || hvKm(window.cLat, window.cLon, stop.coords[0], stop.coords[1]) <= 8)))
      : routeStops;
    const activeStop = routeStops[0];
    const raw = [];
    if (tripActive && window.cLat && window.cLon) raw.push([window.cLat, window.cLon]);
    if (tripActive && activeStop) raw.push(activeStop.coords);
    else raw.push(...visibleStops.map(l => l.coords));

    let nsDist = '--';
    let nsEta = '--';
    if (routeStart && routeStops.length && hasValidCoords(routeStart) && hasValidCoords(routeStops[0]?.coords)) {
      nsDist = hvKm(routeStart[0], routeStart[1], routeStops[0].coords[0], routeStops[0].coords[1]).toFixed(1) + 'km';
      nsEta = fmtM(routeStops[0].tt || 10);
    }
    const accent = '#00c8f0';
    visibleStops.forEach((l) => {
      const i = routeStops.findIndex(stop => stop.id === l.id);
      const isCurrent = i === 0;
      const exp = calculateExperienceScore(l, window.globalSimulationTime);
      let expCol = '#6b7280';
      if (exp.score > 79) expCol = '#10b981';
      else if (exp.score > 59) expCol = '#f59e0b';
      else if (exp.score > 39) expCol = '#f97316';
      else if (exp.score > 0) expCol = '#ef4444';
      const col = tripActive && isCurrent ? '#00e5a0' : expCol;
      const size = isCurrent ? 18 : (tripActive ? 12 : 16);
      const shadow = isCurrent ? `${col}88` : 'rgba(255,255,255,0.18)';
      const label = tripActive && !isCurrent ? `<div style="position:absolute;top:-10px;right:-8px;min-width:16px;height:16px;border-radius:999px;background:rgba(8,14,26,.92);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px">${i + 1}</div>` : '';
      const ic = window.L.divIcon({ className: 'iit-marker', html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 0 10px ${shadow};opacity:${tripActive && !isCurrent ? 0.75 : 1}">${label}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const popupHtml = `
        <div style="min-width:180px;">
          <b>${escapeHtml(l.name)}</b><br>
          <small>${isCurrent && tripActive ? 'Next stop' : `Visit: ${fmtM(l.vt)}`}</small>
          <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="color:${expCol};font-size:16px;">Score: ${exp.score}/100</strong>
            <span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:10px;">${exp.state}</span>
          </div>
          <ul style="padding-left:16px;margin:0;font-size:11px;color:var(--text-muted);line-height:1.4;">
            ${exp.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
          ${typeof window.getTimeBadgesHtml === 'function' ? window.getTimeBadgesHtml(l) : ''}
          ${typeof window.getTravelIntelPanelHtml === 'function' ? window.getTravelIntelPanelHtml(l) : ''}
        </div>
      `;
      mkrs.push(window.L.marker(l.coords, { icon: ic }).addTo(map).bindPopup(popupHtml));
    });

    if (raw.length >= 2) {
      rLine = window.L.polyline(raw, { color: accent, weight: tripActive ? 6 : 4, opacity: tripActive ? 0.95 : 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      setRoutePolyline(rLine);
      if (!tripActive && map && typeof map.fitBounds === 'function') map.fitBounds(rLine.getBounds(), { padding: [60, 100] });
    }

    const nextEl = document.getElementById('nav-next');
    const turnEl = document.getElementById('nav-turn');
    const turnIconEl = document.getElementById('nav-turn-icon');
    const distEl = document.getElementById('nav-dist');
    const etaEl = document.getElementById('nav-eta');

    if (nextEl) nextEl.textContent = routeStops[0].name;
    const defaultNavText = `Head towards ${routeStops[0].name} (~${nsDist})`;
    if (turnEl) turnEl.textContent = defaultNavText;
    if (turnIconEl) turnIconEl.textContent = turnArrowForInstruction(defaultNavText);
    if (distEl) distEl.textContent = nsDist;
    if (etaEl) etaEl.textContent = nsEta;

    const roadRouteApplied = raw.length >= 2 ? await fetchRoadRoute(raw, { accent, tripActive, routeStops }) : false;
    if (!roadRouteApplied && tripActive) {
      clearTimeout(window._roadRouteRetryTimer);
      window._roadRouteRetryTimer = setTimeout(() => { if (window.tripActive) renderRoute(); }, 4000);
    }
    if (typeof updateItinUI === 'function') updateItinUI();
    if (window.streetQuestActive && typeof setupStreetQuest === 'function') setupStreetQuest();
  }

  return {
    clearAllMarkers,
    renderMapMarkers,
    fetchRoadRoute,
    renderRoute,
  };
}
