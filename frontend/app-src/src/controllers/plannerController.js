/**
 * frontend/app-src/src/controllers/plannerController.js
 * Multi-day itinerary generation, timeline UI rendering, time calculations, and route re-ordering.
 */

import { browserLogger } from '../utils/browser-logger.js';
import { optimizeStopOrder, buildTimeAwareDay } from '../modules/timeAwarePlanner.js';

export function createPlannerController({
  API,
  CITIES,
  _normalizeLatLon,
  ensureCityPlaces,
  prioritizePlanStops,
  _keepNearbyCluster,
  escapeHtml,
  _fmtM,
  t2m,
  _m2t,
  getTripMinutes,
  _getBreakEveryMinutes,
  _getBreakDurationMinutes,
  getCurTime,
  syncPlannerTimeFields,
  switchToView,
  addMsg,
  addTypingIndicator,
  _showToast,
  renderRoute,
  renderMapMarkers,
  updatePlannerShowcase,
  _fetchWeatherUI,
  syncState,
  clearStreetQuestLayers,
  updateStreetQuestUI,
  updateFollowButton
}) {
  let _lastTrimNoticeSignature = '';
  function resetTrimNotice() { _lastTrimNoticeSignature = ''; }

  function fmt12(d) {
    const h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12, mm = String(m).padStart(2, '0');
    return `${hh}:${mm} ${ap}`;
  }

  function getScheduleStart() {
    const startMin = t2m(document.getElementById('s-time')?.value || '09:00', 9 * 60);
    const t = new Date();
    t.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    return t;
  }

  function getScheduleEnd() {
    return new Date(getScheduleStart().getTime() + getTripMinutes() * 60000);
  }

  function recalcTimes(opts = {}) {
    const trimToWindow = !opts.trimToWindow;
    const windowEnd = getScheduleEnd();
    let t = getCurTime();
    const kept = [];
    let dropped = 0;
    const droppedNames = [];
    const startBase = getScheduleStart();
    const dayStartMin = startBase.getHours() * 60 + startBase.getMinutes();
    const itin = window.itin || [];

    for (const loc of itin) {
      const fixedAt = loc.arriveAt && /^\d{1,2}:\d{2}$/.test(String(loc.arriveAt).trim());
      if (!window.tripActive && (loc.geoOptimized || loc.scheduleLocked) && (fixedAt || loc.arriveMin != null)) {
        const arriveMin = loc.arriveMin != null ? loc.arriveMin : t2m(loc.arriveAt, dayStartMin);
        const depMin = loc.departMin != null ? loc.departMin : (arriveMin + (Number(loc.vt) || 45));
        const arriveDate = new Date();
        arriveDate.setHours(Math.floor(arriveMin / 60), arriveMin % 60, 0, 0);
        const depDate = new Date();
        depDate.setHours(Math.floor(depMin / 60), depMin % 60, 0, 0);
        loc.std = arriveDate;
        loc.etd = depDate;
        loc.sts = fmt12(arriveDate);
        loc.ets = fmt12(depDate);
        t = new Date(depDate.getTime() + (Number(loc.tt) || 15) * 60000);
        kept.push(loc);
        continue;
      }
      const arr = new Date(t.getTime() + (loc.tt || 0) * 60000);
      const dep = new Date(arr.getTime() + loc.vt * 60000);
      if (trimToWindow && dep > windowEnd && kept.length > 0) {
        dropped++;
        droppedNames.push(loc.name);
        continue;
      }
      loc.std = arr; loc.etd = dep;
      loc.sts = fmt12(arr); loc.ets = fmt12(dep);
      t = dep;
      kept.push(loc);
    }

    if (dropped > 0 && trimToWindow) {
      const tripEndFmt = fmt12(windowEnd);
      const signature = `${tripEndFmt}:${droppedNames.sort().join('|')}`;
      if (signature !== _lastTrimNoticeSignature) {
        _lastTrimNoticeSignature = signature;
        const nameList = droppedNames.slice(0, 3).map(n => `<strong>${escapeHtml(n)}</strong>`).join(', ') + (droppedNames.length > 3 ? ` and ${droppedNames.length - 3} more` : '');
        addMsg(`⏱️ <strong>Plan trimmed to your trip window (${tripEndFmt})</strong><br>Omitted ${nameList} so you finish on time without rushing. Increase your duration if you want to include them!`);
      }
    }
    window.itin = kept;
    return dropped;
  }

  async function generatePlan() {
    const _genBtn = document.querySelector('[data-action="generatePlan"]');
    if (_genBtn) { _genBtn.disabled = true; _genBtn.style.cursor = 'wait'; _genBtn.innerHTML = '<span>Generating…</span> <span>✦</span>'; }
    try {
      window.tripActive = false;
      window.tripStart = null;
      window.lastHeading = null;
      window.lastSpokenNavInstruction = '';
      window.streetQuestActive = false;
      if (typeof clearStreetQuestLayers === 'function') clearStreetQuestLayers();
      if (typeof updateStreetQuestUI === 'function') updateStreetQuestUI();
      if (typeof updateFollowButton === 'function') updateFollowButton();

      syncPlannerTimeFields('end');
      const _maxT0 = getTripMinutes();
      const _nDays0 = parseInt(document.getElementById('n-days')?.value, 10) || 1;
      const minPlacePool = Math.min(45, Math.max(16, _nDays0 * 6));
      const cityId = document.getElementById('city-select')?.value || window.currentCityId;
      const city = CITIES[cityId];

      if (window.LOCS?.length > 0 && window.LOCS.length < minPlacePool && city) {
        const ready = await ensureCityPlaces(city, minPlacePool);
        if (!ready && window.LOCS.length < minPlacePool) {
          addMsg(`ℹ️ I found <strong>${window.LOCS.length}</strong> ready places. For a fuller ${_nDays0}-day trip, enable more experience types or tap Generate again after the background refresh finishes.`);
        }
      }

      if (!window.LOCS?.length) {
        if (city) {
          switchToView('chat-view', 2);
          addMsg(`🤖 <strong>Fetching places for ${city.name}…</strong> Building your options now — this can take up to 30 seconds for the first load.`);
          const loadTyping = addTypingIndicator();
          try {
            await ensureCityPlaces(city, minPlacePool);
          } catch (_e) { browserLogger.error('generatePlan load error:', _e); }
          loadTyping.remove();
        }
        if (!window.LOCS?.length) {
          addMsg(city
            ? `⚠️ We couldn't load places for <strong>${city.name}</strong> this time. Please tap Generate again.`
            : '⚠️ Please select a city from the dropdown first, then tap Generate!');
          switchToView('plan-view', 1);
          return;
        }
        switchToView('plan-view', 1);
      }

      const prefs = Array.from(document.querySelectorAll('.pref:checked')).map(c => c.value);
      if (!prefs.length) { addMsg('⚠️ Select at least one experience type.'); return; }
      const vibe = (document.getElementById('vibe')?.value || '').trim();
      const maxT = getTripMinutes();
      const si = document.getElementById('s-time')?.value || '09:00';
      const nDays = parseInt(document.getElementById('n-days')?.value, 10) || 1;
      window.mdPlan = []; window.itin = []; window.dayIdx = 0;

      let avail = (window.LOCS || []).filter(l => prefs.includes(l.cat) || l.isHiddenGem);
      if (window.customSelectedPlaces && window.customSelectedPlaces.length > 0) {
        avail = (window.LOCS || []).filter(l => window.customSelectedPlaces.includes(String(l.id)));
        if (!avail.length) {
          addMsg('⚠️ None of your custom selected places could be found. Using filters instead.');
          avail = (window.LOCS || []).filter(l => prefs.includes(l.cat));
        }
      }

      if (!avail.length) { addMsg('⚠️ No places match your selections. Enable more experiences.'); return; }
      const routeStart = typeof window.getCityCenter === 'function' ? (window.getCityCenter() || window.getRouteStart()) : window.getRouteStart();
      avail = prioritizePlanStops(avail, routeStart, prefs);

      switchToView('plan-view', 1);
      if (vibe) {
        const typing = addTypingIndicator();
        addMsg(`✨ Analyzing your vibe: "<em>${vibe}</em>"...`);
        try {
          const aiResp = await API.aiVibe(vibe, window.currentCityName, avail.map(l => l.name));
          typing.remove();
          if (aiResp) {
            const preferred = aiResp.split(',').map(s => s.trim().toLowerCase());
            let aiM = avail.filter(l => preferred.some(n => l.name.toLowerCase().includes(n)));
            let nonM = avail.filter(l => !preferred.some(n => l.name.toLowerCase().includes(n)));
            if (aiM.length) {
              aiM = optimizeStopOrder(aiM, routeStart);
              const last = aiM[aiM.length - 1];
              nonM = optimizeStopOrder(nonM, last?.coords || routeStart);
              avail = [...aiM, ...nonM];
              addMsg('🔮 AI tailored your stops to your vibe!');
            }
          }
        } catch { typing.remove(); }
      }

      const startMin = t2m(si);
      const cityCenterForDays = (CITIES[window.currentCityId]?.lat && CITIES[window.currentCityId]?.lon)
        ? [CITIES[window.currentCityId].lat, CITIES[window.currentCityId].lon] : routeStart;

      // Plan generation loop
      let rem = [...avail];
      const geoDays = [];
      for (let d = 0; d < nDays && rem.length > 0; d++) {
        const dayStart = d === 0 ? routeStart : (geoDays[d - 1]?.[geoDays[d - 1].length - 1]?.coords || cityCenterForDays);
        const dayStops = buildTimeAwareDay(rem, startMin, maxT, dayStart, window.realTemp || 28, 0, 0);
        const dayStopsArr = Array.isArray(dayStops) ? dayStops : (dayStops?.day || []);
        if (dayStopsArr.length) {
          geoDays.push(dayStopsArr);
          const usedIds = new Set(dayStopsArr.map(s => s.id));
          rem = rem.filter(s => !usedIds.has(s.id));
        }
      }

      window.mdPlan = geoDays.length ? geoDays : [avail.slice(0, 5)];
      window.itin = window.mdPlan[0] || [];
      window.dayIdx = 0;

      recalcTimes({ trimToWindow: true });
      syncState();
      await renderRoute();
      renderMapMarkers();
      updatePlannerShowcase();
      addMsg(`✅ Staged <strong>${window.itin.length} stops</strong> for Day 1 in ${window.currentCityName}!`);
    } finally {
      if (_genBtn) { _genBtn.disabled = false; _genBtn.style.cursor = ''; _genBtn.innerHTML = '<span>Generate Plan</span> <span>✦</span>'; }
    }
  }

  function switchDay(idx) {
    if (!window.mdPlan || !window.mdPlan[idx]) return;
    window.dayIdx = idx;
    window.itin = window.mdPlan[idx];
    recalcTimes({ trimToWindow: true });
    syncState();
    renderRoute();
    renderMapMarkers();
    updatePlannerShowcase();
  }

  function skipStop(idx) {
    if (!window.itin || !window.itin[idx]) return;
    const skipped = window.itin.splice(idx, 1)[0];
    recalcTimes({ trimToWindow: true });
    syncState();
    renderRoute();
    addMsg(`⏭️ Skipped <strong>${escapeHtml(skipped.name)}</strong>.`);
  }

  return {
    resetTrimNotice,
    fmt12,
    getScheduleStart,
    getScheduleEnd,
    recalcTimes,
    generatePlan,
    switchDay,
    skipStop,
  };
}
