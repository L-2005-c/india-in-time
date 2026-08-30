/**
 * Floating Frosted Map HUD & Spatial Interactivity Module (FAANG Grade)
 * Provides 1-tap layer switching, fullscreen toggle, custom vector pins,
 * multi-stop Google Maps sync, GPX track export, and 2-way map pin <-> timeline highlight synchronization.
 */

import { emit } from '../platform/eventBus.js';

export function generateMultiStopGoogleMapsUrl(stops = [], originCoords = null) {
  const valid = (stops || []).filter(s => !s.isBreak && Array.isArray(s.coords) && s.coords.length >= 2);
  if (!valid.length) return '#';
  const origin = originCoords || valid[0].coords;
  const destination = valid[valid.length - 1].coords;
  const waypoints = valid.slice(0, -1).map(s => `${s.coords[0]},${s.coords[1]}`).join('|');
  const base = 'https://www.google.com/maps/dir/?api=1';
  const originParam = `origin=${origin[0]},${origin[1]}`;
  const destParam = `destination=${destination[0]},${destination[1]}`;
  const wpParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
  return `${base}&${originParam}&${destParam}${wpParam}&travelmode=driving`;
}

export function exportItineraryAsGpx(stops = [], cityName = 'India') {
  const valid = (stops || []).filter(s => !s.isBreak && Array.isArray(s.coords) && s.coords.length >= 2);
  if (!valid.length) return false;
  
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="IndiaInTime - FAANG Travel SaaS" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${cityName} Intelligent Itinerary</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;
  
  const waypoints = valid.map((s, i) => `  <wpt lat="${s.coords[0]}" lon="${s.coords[1]}">
    <name>${i + 1}. ${(s.name || '').replace(/[<>&]/g, '')}</name>
    <desc>Category: ${s.cat || 'sight'} | Arrive: ${s.arriveAt || s.sts || ''} | Stay: ${s.vt || 45}m</desc>
  </wpt>`).join('\n');

  const trkPoints = valid.map(s => `      <trkpt lat="${s.coords[0]}" lon="${s.coords[1]}"></trkpt>`).join('\n');
  const track = `  <trk>
    <name>${cityName} Optimized Route</name>
    <trkseg>
${trkPoints}
    </trkseg>
  </trk>`;

  const gpxContent = `${gpxHeader}\n${waypoints}\n${track}\n</gpx>`;
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cityName.toLowerCase().replace(/\s+/g, '-')}-itinerary.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function renderMapHudDock() {
  return `
    <div id="map-hud-dock" class="map-hud-dock">
      <button class="map-hud-pill" data-action="toggleMapLayer" title="Switch Map View Layer">
        <span>🗺️</span> <span id="map-layer-label">Vector</span>
      </button>
      <button class="map-hud-pill" data-action="exportGoogleMapsTrip" id="hud-btn-gmaps" title="Open Full Multi-Stop Route in Google Maps">
        <span>🧭</span> <span>Google Maps Sync</span>
      </button>
      <button class="map-hud-pill" data-action="exportGpxTrack" id="hud-btn-gpx" title="Download GPX GPS Track">
        <span>📥</span> <span>GPX</span>
      </button>
      <button class="map-hud-pill" data-action="toggleMapFullscreen" title="Toggle Fullscreen Map">
        <span>⛶</span> <span>Expand</span>
      </button>
    </div>
  `;
}

export function highlightStopOnTimelineAndMap(stopIndex) {
  document.querySelectorAll('.stop-card, .faang-stop-card').forEach((card) => {
    card.classList.remove('is-active-stop');
  });

  const cards = document.querySelectorAll('.stop-card:not(.break-card)');
  const targetCard = cards[stopIndex];
  if (targetCard) {
    targetCard.classList.add('is-active-stop');
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  emit('map:highlightPin', { stopIndex });
}

