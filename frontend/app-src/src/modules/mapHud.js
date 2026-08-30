/**
 * Floating Frosted Map HUD & Spatial Interactivity Module
 * Provides 1-tap layer switching, fullscreen toggle, custom vector pins,
 * and 2-way map pin <-> timeline highlight synchronization.
 */

import { emit } from '../platform/eventBus.js';

export function renderMapHudDock() {
  return `
    <div id="map-hud-dock" class="map-hud-dock">
      <button class="map-hud-pill" data-action="toggleMapLayer" title="Switch Map View Layer">
        <span>🗺️</span> <span id="map-layer-label">Vector</span>
      </button>
      <button class="map-hud-pill" data-action="toggleMapFullscreen" title="Toggle Fullscreen Map">
        <span>⛶</span> <span>Expand</span>
      </button>
    </div>
  `;
}

export function highlightStopOnTimelineAndMap(stopIndex) {
  // Remove existing active states
  document.querySelectorAll('.faang-stop-card').forEach((card) => {
    card.classList.remove('is-active-stop');
  });

  const targetCard = document.getElementById(`stop-card-${stopIndex}`);
  if (targetCard) {
    targetCard.classList.add('is-active-stop');
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  emit('map:highlightPin', { stopIndex });
}
