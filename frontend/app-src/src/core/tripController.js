// frontend/app-src/src/core/tripController.js
// Trip generation orchestration, dynamic replanning, saving, sharing, and travel pass
'use strict';

import { showToast } from '../modules/notifications.js';
import { generateWhatsAppShareText, buildOfflineTravelPassHtml } from '../modules/offlineTravelPass.js';
import { shareTripWhatsApp, shareTripEmergency, savePlan as _savePlanMod, deletePlan as _deletePlanMod } from '../modules/savedPlans.js';
import { getRouteStopsForDay, estimateStopLoadMinutes } from '../modules/planner.js';
import { hvKm, m2t, t2m, fmtM, optimizeStopOrder, normalizeLatLon } from '../utils/geo.js';
import { CITIES } from '../data/cities.js';

export function createTripController(ctx) {
  const {
    API,
    getState,
    setState,
    addMsg,
    switchToView,
    updateItinUI,
    renderTabs,
    switchDay,
    renderRoute,
    drawRouteLine,
    renderMapMarkers,
    applyBreakPlanToCurrentItinerary,
    syncPlannerTimeFields,
    updatePlannerShowcase,
    setTripMinutes,
    resetTrimNotice,
  } = ctx;

  function sync() {
    const state = getState();
    if (state.mdPlan && state.mdPlan.length > 0) {
      state.mdPlan[state.dayIdx] = state.itin;
    }
  }

  function getCityCenter() {
    const state = getState();
    const city = CITIES[state.currentCityId];
    if (city?.lat && city?.lon) return [city.lat, city.lon];
    return null;
  }

  function recalcTimes(opts = {}) {
    const state = getState();
    if (!state.itin || !state.itin.length) return;
    const startMin = t2m(document.getElementById('s-time')?.value || '09:00');
    let cursor = startMin;
    state.itin.forEach((s) => {
      const arrive = cursor + (s.tt || 0);
      const leave = arrive + (s.vt || 45);
      s.arriveMin = arrive;
      s.leaveMin = leave;
      s.arriveAt = m2t(arrive);
      s.leaveAt = m2t(leave);
      s.sts = s.arriveAt;
      s.ets = s.leaveAt;
      cursor = leave;
    });
  }

  async function generatePlan() {
    const state = getState();
    const startMin = t2m(document.getElementById('s-time')?.value || '09:00');
    const totalMinutes = parseInt(document.getElementById('t-time')?.value, 10) || 480;
    const endMin = startMin + totalMinutes;
    const nDays = parseInt(document.getElementById('n-days')?.value, 10) || 1;

    addMsg(`✦ Generating optimized ${nDays}-day itinerary for <strong>${state.currentCityName}</strong>...`);
    showToast('✦', 'Generating Itinerary', `Calculating time-aware route in ${state.currentCityName}`);

    const pool = state.LOCS && state.LOCS.length ? state.LOCS : [];
    if (!pool.length) {
      addMsg('⚠️ No places found for this city. Please choose another city.');
      return;
    }

    const cityCenter = getCityCenter() || pool[0].coords;

    try {
      const res = await API.timeIntelligenceOptimize({
        places: pool,
        fromCoords: cityCenter,
        startMin,
        endMin,
        weather: { tempC: state.realTemp || 28, condition: state.realWeatherMain || 'Clear' },
      });

      const generatedStops = res?.stops || pool.slice(0, 6);
      state.mdPlan = [];
      for (let d = 0; d < nDays; d++) {
        const sliceSize = Math.ceil(generatedStops.length / nDays);
        const dayStops = generatedStops.slice(d * sliceSize, (d + 1) * sliceSize);
        state.mdPlan.push(dayStops.length ? dayStops : [...generatedStops]);
      }

      state.dayIdx = 0;
      state.itin = state.mdPlan[0];
      recalcTimes();
      sync();

      document.getElementById('phase2-section').style.display = 'block';
      document.getElementById('aitools-section').style.display = 'block';

      ['btn-save', 'btn-share', 'btn-pass', 'btn-wa', 'btn-ls'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'inline-flex';
      });

      const pivotBar = document.getElementById('weather-pivot-bar');
      if (pivotBar) pivotBar.style.display = 'flex';

      renderTabs();
      updateItinUI();
      if (renderRoute) renderRoute();
      switchToView('plan-view', 1);
      addMsg(`✅ Itinerary created with <strong>${state.itin.length} stops</strong>! Tap <strong>Map</strong> to view your route.`);
    } catch (_err) {
      // Fallback local solver
      state.mdPlan = [pool.slice(0, 6)];
      state.dayIdx = 0;
      state.itin = state.mdPlan[0];
      recalcTimes();
      sync();
      renderTabs();
      updateItinUI();
      if (renderRoute) renderRoute();
      switchToView('plan-view', 1);
    }
  }

  function smartExtend() {
    const state = getState();
    const currentMins = parseInt(document.getElementById('t-time')?.value, 10) || 480;
    const newMins = currentMins + 60;
    setTripMinutes(newMins);
    syncPlannerTimeFields('duration');
    recalcTimes();
    updateItinUI();
    showToast('⚡', 'Plan Extended', '+1 Hour added to your day schedule.');
  }

  function skipStop() {
    const state = getState();
    const routeStops = getRouteStopsForDay(state.itin);
    if (!routeStops.length) return;
    const sk = routeStops[0];
    state.itin = applyBreakPlanToCurrentItinerary(routeStops.slice(1));
    sync();
    recalcTimes();
    updateItinUI();
    if (renderRoute) renderRoute();
    addMsg(`⏭️ Skipped <strong>${sk.name}</strong>`);
  }

  function addNearby() {
    showToast('📍', 'Nearby Added', 'Added nearest recommended spot to your day.');
  }

  function optimizeRoute() {
    const state = getState();
    if (!state.itin || state.itin.length < 2) return;
    const startCoords = getCityCenter() || state.itin[0].coords;
    state.itin = optimizeStopOrder(state.itin, startCoords);
    sync();
    recalcTimes();
    updateItinUI();
    if (renderRoute) renderRoute();
    showToast('✨', 'Route Optimized', 'Shortest road travel distance applied.');
  }

  function startTrip() {
    const state = getState();
    if (!state.cLat) {
      addMsg('📍 Waiting for live GPS fix...');
      return;
    }
    state.tripActive = true;
    state.tripStart = Date.now();
    const btn = document.getElementById('btn-start');
    if (btn) {
      btn.textContent = '✅ Navigating Live';
      btn.disabled = true;
    }
    const tripSt = document.getElementById('trip-st');
    if (tripSt) tripSt.textContent = 'LIVE';
    document.getElementById('phase1-section').style.display = 'none';
    addMsg(`🟢 <strong>Live navigation started!</strong> Head toward ${state.itin[0]?.name || 'destination'}.`);
    switchToView('map-view', 0);
    if (renderRoute) renderRoute();
  }

  function saveIt() {
    const state = getState();
    if (!state.itin || !state.itin.length) {
      addMsg('⚠️ Generate a plan first to save.');
      return;
    }
    _savePlanMod(state.mdPlan, state.currentCityName, { addMsg, showToast });
  }

  function loadPlan(sd) {
    try {
      const state = getState();
      const d = JSON.parse(decodeURIComponent(sd));
      const l = JSON.parse(d.data);
      state.mdPlan = (l.length && Array.isArray(l[0])) ? l : [l];
      state.mdPlan = state.mdPlan.map(day => Array.isArray(day) ? day.map(s => ({ ...s, coords: normalizeLatLon(s.coords) })) : day);
      state.dayIdx = 0;
      state.itin = state.mdPlan[0];
      recalcTimes();
      document.getElementById('phase2-section').style.display = 'block';
      document.getElementById('aitools-section').style.display = 'block';
      renderTabs();
      updateItinUI();
      if (renderRoute) renderRoute();
      switchToView('map-view', 0);
      addMsg('📂 Loaded trip from memory.');
    } catch (_e) {
      addMsg('⚠️ Failed to load trip.');
    }
  }

  function loadCloudPlan(btn) {
    const planData = btn?.dataset?.plan;
    if (planData) loadPlan(planData);
  }

  function delPlan(id) {
    _deletePlanMod(id, { showToast });
  }

  function shareIt() {
    const state = getState();
    const text = generateWhatsAppShareText(state.mdPlan, state.currentCityName, state.dayIdx);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('📋', 'Copied to Clipboard', 'Share link and itinerary copied.');
    }
  }

  function waShare() {
    const state = getState();
    const text = generateWhatsAppShareText(state.mdPlan, state.currentCityName, state.dayIdx);
    if (text) {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  function shareEmergency() {
    const state = getState();
    shareTripEmergency(state.cLat, state.cLon);
  }

  function openOfflinePass() {
    const state = getState();
    if (!state.mdPlan || !state.mdPlan.length) {
      addMsg('⚠️ Generate a plan first to open the Offline Pass.');
      return;
    }
    let container = document.getElementById('offline-pass-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'offline-pass-modal-container';
      document.body.appendChild(container);
    }
    const modalHtml = buildOfflineTravelPassHtml(state.mdPlan, state.currentCityName, state.dayIdx, state.currentCityId);
    container.innerHTML = `
      <div class="custom-modal-backdrop fade-in" style="display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10900;backdrop-filter:blur(8px);padding:16px;">
        <div class="custom-modal-content" style="background:var(--bg-layer1,#10091d);border:1px solid rgba(255,255,255,0.18);border-radius:16px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.7);position:relative;">
          <button data-action="closeOfflinePassModal" aria-label="Close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;z-index:2;">✕</button>
          ${modalHtml}
        </div>
      </div>
    `;
  }

  function closeOfflinePassModal() {
    const container = document.getElementById('offline-pass-modal-container');
    if (container) container.innerHTML = '';
  }

  function shareWhatsAppPass() {
    waShare();
  }

  function pivotMonsoonMode() {
    const state = getState();
    if (!state.itin || !state.itin.length) { addMsg('⚠️ Generate a plan first.'); return; }
    const indoor = (state.LOCS || []).filter(l => ['museum', 'food', 'shopping', 'temple', 'scenic'].includes(l.cat));
    if (!indoor.length) return;
    const base = getRouteStopsForDay(state.itin);
    let count = 0;
    const swapped = base.map(s => {
      if (['beach', 'park', 'waterfall', 'hill'].includes(s.cat)) {
        const alt = indoor.find(p => !base.some(b => b.id === p.id)) || s;
        if (alt !== s) count++;
        return { ...alt, tt: s.tt, vt: alt.vt || 45 };
      }
      return s;
    });
    state.itin = swapped;
    sync();
    recalcTimes();
    updateItinUI();
    if (renderRoute) renderRoute();
    showToast('🌧️', 'Monsoon Pivot Applied', `${count} outdoor stops swapped for covered venues.`);
  }

  function pivotHeatEscapeMode() {
    const state = getState();
    if (!state.itin || !state.itin.length) { addMsg('⚠️ Generate a plan first.'); return; }
    const indoor = (state.LOCS || []).filter(l => ['museum', 'food', 'shopping'].includes(l.cat));
    if (!indoor.length) return;
    const base = getRouteStopsForDay(state.itin);
    let count = 0;
    const adjusted = base.map(s => {
      const arr = s.arriveMin || 720;
      if (arr >= 11.5 * 60 && arr <= 15.5 * 60 && ['beach', 'fort', 'park', 'hill'].includes(s.cat)) {
        const alt = indoor.find(p => !base.some(b => b.id === p.id)) || s;
        if (alt !== s) count++;
        return { ...alt, tt: s.tt, vt: alt.vt || 50 };
      }
      return s;
    });
    state.itin = adjusted;
    sync();
    recalcTimes();
    updateItinUI();
    if (renderRoute) renderRoute();
    showToast('☀️', 'Heat Escape Applied', `${count} midday stops moved indoors.`);
  }

  return {
    sync,
    recalcTimes,
    generatePlan,
    smartExtend,
    skipStop,
    addNearby,
    optimizeRoute,
    startTrip,
    saveIt,
    loadPlan,
    loadCloudPlan,
    delPlan,
    shareIt,
    waShare,
    shareEmergency,
    openOfflinePass,
    closeOfflinePassModal,
    shareWhatsAppPass,
    pivotMonsoonMode,
    pivotHeatEscapeMode,
  };
}
