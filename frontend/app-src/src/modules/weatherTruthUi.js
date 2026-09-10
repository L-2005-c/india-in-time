'use strict';

/**
 * frontend/app-src/src/modules/weatherTruthUi.js
 *
 * Weather Truth & Provenance Progressive Disclosure UI (v3.0).
 * Displays meteorological station grounding, observation vs forecast state,
 * raw vs rounded temperature, and provider consensus/divergence.
 */

let _activeWeatherData = null;

export function updateWeatherTruthData(data) {
  _activeWeatherData = data;
}

export function openWeatherTruthModal(weatherData = null) {
  const data = weatherData || _activeWeatherData;
  const modal = document.getElementById('weather-truth-modal');
  if (!modal) return;

  if (data) {
    _renderWeatherTruthModal(data);
  }
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

export function closeWeatherTruthModal() {
  const modal = document.getElementById('weather-truth-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function _renderWeatherTruthModal(data) {
  const rawTemp = data.rawTemperatureC ?? data.tempC ?? data.temp;
  const dispTemp = data.displayTemperatureC ?? data.temp;
  const state = (data.dataState || 'PREDICTED').toUpperCase();
  const confidence = (data.confidence || 'MEDIUM').toUpperCase();
  const station = data.station || {};
  const lat = window._lastKnownLatLon?.[0] || 17.6868;
  const lon = window._lastKnownLatLon?.[1] || 83.2185;

  const rawEl = document.getElementById('wx-truth-raw-temp');
  if (rawEl) rawEl.textContent = `${rawTemp}°C`;

  const dispEl = document.getElementById('wx-truth-disp-temp');
  if (dispEl) dispEl.textContent = `${dispTemp}°C`;

  const condEl = document.getElementById('wx-truth-condition');
  if (condEl) condEl.textContent = `${data.emoji || '🌤️'} ${data.condition || 'Clear'}`;

  const stateBadge = document.getElementById('wx-truth-state-badge');
  if (stateBadge) {
    stateBadge.textContent = state;
    stateBadge.className = `wx-state-pill wx-state-${state.toLowerCase()}`;
  }

  const confBadge = document.getElementById('wx-truth-conf-badge');
  if (confBadge) {
    confBadge.textContent = `${confidence} CONFIDENCE`;
    confBadge.className = `wx-conf-pill wx-conf-${confidence.toLowerCase()}`;
  }

  const sourceEl = document.getElementById('wx-truth-source');
  if (sourceEl) sourceEl.textContent = data.forecastSource || 'Consensus Engine';

  const stationEl = document.getElementById('wx-truth-station');
  if (stationEl) {
    if (station.name) {
      stationEl.textContent = `${station.name} (${station.distanceKm ?? '--'} km away, ${station.elevationM ?? '--'}m elevation)`;
    } else {
      stationEl.textContent = 'Regional Climatological Grid (Spatial Nearest)';
    }
  }

  const timeEl = document.getElementById('wx-truth-updated');
  if (timeEl) timeEl.textContent = data.updatedAtIST || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';

  const advContainer = document.getElementById('wx-truth-advisories');
  if (advContainer) {
    if (Array.isArray(data.advisories) && data.advisories.length) {
      advContainer.innerHTML = data.advisories.map(a => `<div class="wx-truth-advisory-item">ℹ️ ${escapeHtml(a)}</div>`).join('');
      advContainer.style.display = 'block';
    } else {
      advContainer.style.display = 'none';
    }
  }

  const diagLink = document.getElementById('wx-truth-diag-link');
  if (diagLink) {
    diagLink.href = `/api/weather/debug?lat=${lat}&lon=${lon}`;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function initWeatherTruthUi() {
  const trigger = document.getElementById('wx-display');
  if (trigger) {
    trigger.style.cursor = 'pointer';
    trigger.title = 'Click to inspect Weather Truth & Provenance';
    trigger.addEventListener('click', () => openWeatherTruthModal());
  }

  const closeBtn = document.getElementById('weather-truth-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeWeatherTruthModal());
  }

  const overlay = document.getElementById('weather-truth-modal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeWeatherTruthModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
      closeWeatherTruthModal();
    }
  });
}
