/**
 * Street Quest game layer — extracted from core/app.js.
 * Bind with createStreetQuest(ctx) where ctx holds map + mutable quest fields.
 */
export function createStreetQuest(ctx) {
  const g = () => ctx; // live getters via ctx object mutated by host

  function clearStreetQuestLayers() {
    const c = g();
    (c.streetQuestLayers || []).forEach(layer => { try { c.map?.removeLayer(layer); } catch (_e) {} });
    c.streetQuestLayers = [];
    c.streetQuestItems = [];
    c.streetQuestHazards = [];
  }

  function setStreetQuestMessage(msg) {
    const el = document.getElementById('sq-msg');
    if (el) el.textContent = msg;
  }

  function updateStreetQuestUI() {
    const c = g();
    const root = document.getElementById('street-quest');
    if (root) root.style.display = c.streetQuestActive ? 'block' : 'none';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sq-score', c.streetQuestScore);
    set('sq-level', c.streetQuestLevel);
    set('sq-health', c.streetQuestHealth);
    set('sq-coins', c.streetQuestCoins);
  }

  function getPlayableRoutePoints() {
    const c = g();
    const pts = [];
    if (c.rLine && typeof c.rLine.getLatLngs === 'function') {
      const latlngs = c.rLine.getLatLngs();
      const flat = Array.isArray(latlngs[0]) ? latlngs.flat() : latlngs;
      flat.forEach(ll => { if (ll && ll.lat != null) pts.push([ll.lat, ll.lng]); });
    }
    if (!pts.length && c.itin) {
      c.itin.filter(s => s.coords).forEach(s => pts.push(s.coords));
    }
    return pts;
  }

  function interpolatePathPoint(path, ratio) {
    if (!path || path.length < 2) return path?.[0] || null;
    const r = Math.max(0, Math.min(1, ratio));
    const total = path.length - 1;
    const f = r * total;
    const i = Math.floor(f);
    const t = f - i;
    if (i >= path.length - 1) return path[path.length - 1];
    const a = path[i], b = path[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function createQuestMarker(coords, emoji, color) {
    const c = g();
    if (!c.map || !window.L) return null;
    const ic = L.divIcon({
      className: 'sq-marker',
      html: `<div style="background:${color};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-size:12px">${emoji}</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11],
    });
    const m = L.marker(coords, { icon: ic }).addTo(c.map);
    c.streetQuestLayers.push(m);
    return m;
  }

  function setupStreetQuest() {
    const c = g();
    clearStreetQuestLayers();
    const path = getPlayableRoutePoints();
    if (path.length < 2) {
      setStreetQuestMessage('Need an active route to play Street Quest.');
      return false;
    }
    c.streetQuestScore = 0;
    c.streetQuestHealth = 3;
    c.streetQuestCoins = 0;
    c.streetQuestLevel = 1;
    c.streetQuestItems = [];
    c.streetQuestHazards = [];
    c.streetQuestDestinationReached = false;
    for (let i = 1; i <= 5; i++) {
      const pt = interpolatePathPoint(path, i / 6);
      if (!pt) continue;
      const item = { coords: pt, taken: false, marker: createQuestMarker(pt, '✨', '#a855f7') };
      c.streetQuestItems.push(item);
    }
    for (let i = 1; i <= 3; i++) {
      const pt = interpolatePathPoint(path, (i + 0.5) / 4);
      if (!pt) continue;
      const haz = { coords: pt, hit: false, marker: createQuestMarker(pt, '👻', '#ef4444') };
      c.streetQuestHazards.push(haz);
    }
    setStreetQuestMessage('Collect stars, avoid ghosts, reach the end!');
    updateStreetQuestUI();
    return true;
  }

  function toggleStreetQuest(forceState) {
    const c = g();
    const next = typeof forceState === 'boolean' ? forceState : !c.streetQuestActive;
    if (next) {
      if (!c.tripActive) {
        setStreetQuestMessage('Start live navigation first.');
        return;
      }
      if (!setupStreetQuest()) return;
      c.streetQuestActive = true;
    } else {
      c.streetQuestActive = false;
      clearStreetQuestLayers();
      setStreetQuestMessage('');
    }
    updateStreetQuestUI();
  }

  function updateQuestLevel() {
    const c = g();
    c.streetQuestLevel = 1 + Math.floor((c.streetQuestScore || 0) / 50);
  }

  function updateStreetQuestProgress() {
    const c = g();
    if (!c.streetQuestActive || c.cLat == null) return;
    const here = [c.cLat, c.cLon];
    const near = (a, b, m = 28) => {
      if (!a || !b) return false;
      const dx = (a[0] - b[0]) * 111320;
      const dy = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
      return Math.hypot(dx, dy) < m;
    };
    c.streetQuestItems.forEach(it => {
      if (!it.taken && near(here, it.coords)) {
        it.taken = true;
        c.streetQuestScore += 10;
        c.streetQuestCoins += 5;
        try { c.map?.removeLayer(it.marker); } catch (_e) {}
        updateQuestLevel();
        setStreetQuestMessage('+10 star!');
      }
    });
    c.streetQuestHazards.forEach(h => {
      if (!h.hit && near(here, h.coords, 24)) {
        h.hit = true;
        c.streetQuestHealth = Math.max(0, c.streetQuestHealth - 1);
        try { c.map?.removeLayer(h.marker); } catch (_e) {}
        setStreetQuestMessage('Ghost hit! -1 health');
        if (c.streetQuestHealth <= 0) {
          c.streetQuestActive = false;
          setStreetQuestMessage('Street Quest over.');
        }
      }
    });
    const path = getPlayableRoutePoints();
    if (path.length && near(here, path[path.length - 1], 40)) {
      c.streetQuestDestinationReached = true;
      c.streetQuestScore += 25;
      setStreetQuestMessage('Destination reached! +25');
      c.streetQuestActive = false;
    }
    updateStreetQuestUI();
  }

  return {
    clearStreetQuestLayers,
    setStreetQuestMessage,
    updateStreetQuestUI,
    setupStreetQuest,
    toggleStreetQuest,
    updateStreetQuestProgress,
    updateQuestLevel,
    getPlayableRoutePoints,
  };
}
