// frontend/app-src/src/core/cityController.js
// City switching, places customize modal, geocoding search, and city loading
'use strict';

import { CITIES, getHiddenGems, getLocalPlaces } from '../data/cities.js';
import { openModal, closeModal } from '../a11y/modal.js';
import { showToast } from '../modules/notifications.js';
import { escapeHtml } from '../utils/html-safe.js';
import { hvKm, normalizeLatLon, withHiddenGems } from '../utils/geo.js';

export function createCityController(ctx) {
  const {
    API,
    getState,
    setState,
    fetchWeatherUI,
    resetPlanUI,
    updatePlannerShowcase,
    switchToView,
    addMsg,
    renderMapMarkers,
    initGPS,
    waitForFirstGpsFix,
    getTimeBadgesHtml,
    generatePlan,
  } = ctx;

  const placeCache = new Map();
  const placeLoadPromises = new Map();
  let isLocating = false;

  function switchCity(cityId, silent = false) {
    if (!CITIES[cityId]) return;
    const state = getState();
    if (!silent) state.userPickedCity = true;
    const city = CITIES[cityId];
    state.currentCityId = cityId;
    state.currentCityName = city.name;
    const citySelect = document.getElementById('city-select');
    if (citySelect && citySelect.value !== cityId) citySelect.value = cityId;
    const cityInput = document.getElementById('city-input');
    if (cityInput) cityInput.value = city.name;
    state.LOCS = getLocalPlaces(cityId, city.name);
    const hdrCity = document.getElementById('hdr-city');
    if (hdrCity) hdrCity.textContent = state.currentCityName;
    if (state.map && city.lat && city.lon) {
      state.map.stop();
      state.map.flyTo([city.lat, city.lon], 12, { duration: 1.1 });
      setTimeout(() => state.map.invalidateSize(), 100);
    }
    fetchWeatherUI(city.lat, city.lon);
    resetPlanUI();
    updatePlannerShowcase();
    if (!silent) {
      switchToView('plan-view', 1);
      if (state.LOCS.length) {
        addMsg(`✅ Loaded <strong>${state.LOCS.length} ready-to-plan places</strong> for ${city.name}.`);
        showToast(city.emoji || '📍', `${city.name} loaded`, `${state.LOCS.length} places ready.`, 3500);
      }
      loadCityPlaces(city.lat, city.lon, city.name);
    }
    setState(state);
  }

  async function searchCity() {
    const input = document.getElementById('city-input');
    const query = (input?.value || '').trim();
    if (!query) return;
    const matched = Object.keys(CITIES).find(
      id => id.toLowerCase() === query.toLowerCase() || CITIES[id].name.toLowerCase().includes(query.toLowerCase())
    );
    if (matched) {
      switchCity(matched);
      return;
    }
    try {
      showToast('🔍', 'Searching...', `Looking up ${query}`);
      const res = await API.geocode(query);
      if (res && res.lat && res.lon) {
        const state = getState();
        state.currentCityName = res.name || query;
        state.currentCityId = 'custom';
        CITIES.custom = { name: state.currentCityName, lat: res.lat, lon: res.lon };
        switchCity('custom');
      } else {
        showToast('⚠️', 'City not found', `Could not find coordinates for ${query}`);
      }
    } catch {
      showToast('⚠️', 'Search error', 'Could not complete geocoding search.');
    }
  }

  function focusCitySelect() {
    const el = document.getElementById('city-select') || document.getElementById('city-input');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function locateMe() {
    if (isLocating) return;
    isLocating = true;
    const btn = document.getElementById('locate-me-btn');
    if (btn) { btn.disabled = true; btn.classList.add('locating'); }
    try {
      const { lat, lon } = await waitForFirstGpsFix(10000);
      const state = getState();
      if (state.map) {
        state.map.stop();
        state.map.flyTo([lat, lon], Math.max(state.map.getZoom(), 15), { animate: true, duration: 0.8 });
      }
      showToast('📍', 'Live GPS Fix', `Centered on your current location (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
    } catch {
      showToast('⚠️', 'GPS unavailable', 'Could not retrieve your live location.');
    } finally {
      isLocating = false;
      if (btn) { btn.disabled = false; btn.classList.remove('locating'); }
    }
  }

  function resetGPS() {
    const state = getState();
    state.cLat = null;
    state.cLon = null;
    const gpsTxt = document.getElementById('gps-txt');
    if (gpsTxt) gpsTxt.textContent = 'GPS';
    initGPS();
  }

  async function openCustomizeModal() {
    const trigger = document.activeElement;
    const state = getState();
    const cityId = document.getElementById('city-select')?.value || state.currentCityId;
    const city = CITIES[cityId];
    if (!city) {
      addMsg('⚠️ Please select a city first before customizing places.');
      return;
    }
    const listEl = document.getElementById('customize-places-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const available = state.LOCS || [];
    available.forEach(loc => {
      const isSelected = window.customSelectedPlaces ? window.customSelectedPlaces.includes(loc.id) : true;
      const catIcons = { scenic: '⛰️', beach: '🏖️', temple: '🛕', food: '🍛' };
      const icon = catIcons[loc.cat] || '📍';
      const badgesHtml = getTimeBadgesHtml ? getTimeBadgesHtml(loc) : '';
      const item = document.createElement('label');
      item.style.cssText = 'display:flex;align-items:center;padding:12px;background:var(--bg-layer2);border:1px solid var(--border-subtle);border-radius:12px;cursor:pointer;gap:12px;transition:all 0.2s;margin-bottom:8px;';
      item.innerHTML = `
        <input type="checkbox" class="custom-place-cb" value="${loc.id}" ${isSelected ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--brand-primary,#2563eb);">
        <div style="flex:1;display:flex;flex-direction:column;">
          <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${escapeHtml(loc.name)}</span>
          <span style="font-size:12px;color:var(--text-muted);">${icon} ${loc.cat ? loc.cat.charAt(0).toUpperCase() + loc.cat.slice(1) : 'Spot'} • ${loc.vt || 45} mins</span>
          <div style="margin-top:4px;">${badgesHtml}</div>
        </div>
      `;
      listEl.appendChild(item);
    });
    openModal('customize-modal', trigger);
  }

  function closeCustomizeModal() {
    closeModal('customize-modal');
  }

  function selectAllCustomPlaces(isSelected) {
    document.querySelectorAll('.custom-place-cb').forEach(cb => {
      cb.checked = isSelected;
    });
  }

  function applyCustomPlaces() {
    const checkboxes = document.querySelectorAll('.custom-place-cb:checked');
    window.customSelectedPlaces = Array.from(checkboxes).map(cb => cb.value);
    if (window.customSelectedPlaces.length === 0) {
      addMsg('⚠️ You must select at least one place! Selecting all as fallback.');
      window.customSelectedPlaces = null;
    } else {
      addMsg(`✅ Saved ${window.customSelectedPlaces.length} customized places! Generating plan...`);
    }
    closeCustomizeModal();
    generatePlan();
  }

  async function loadCityPlaces(lat, lon, cityName, opts = {}) {
    const state = getState();
    const cityKey = String(cityName || '').toLowerCase();
    const cacheKey = `${cityKey}|places`;
    if (placeCache.has(cacheKey) && !opts.force) {
      state.LOCS = placeCache.get(cacheKey);
      return { places: state.LOCS, source: 'cache' };
    }
    const local = getLocalPlaces(state.currentCityId, cityName);
    if (local.length) {
      state.LOCS = local;
      placeCache.set(cacheKey, local);
      updatePlannerShowcase();
      if (renderMapMarkers) renderMapMarkers();
    }
    return { places: state.LOCS, source: 'local' };
  }

  return {
    switchCity,
    searchCity,
    focusCitySelect,
    locateMe,
    resetGPS,
    openCustomizeModal,
    closeCustomizeModal,
    selectAllCustomPlaces,
    applyCustomPlaces,
    loadCityPlaces,
  };
}
