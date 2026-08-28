// frontend/app-src/src/core/itineraryRenderer.js
// Itinerary timeline rendering, stop cards, road transit connectors, and day tabs
'use strict';

import { escapeHtml } from '../utils/html-safe.js';
import { hvKm, fmtM } from '../utils/geo.js';

export function createItineraryRenderer(ctx) {
  const {
    getState,
    setState,
    t2m,
    m2t,
    getTimeBadgesHtml,
    getTravelIntelPanelHtml,
    calculateStopBudget,
    calculateTripBudget,
    renderBudgetBreakdown,
    getTransportOptions,
    getTrafficLevel,
    getCrowdLevel,
    getCrowdMultiplier,
    getCityCenter,
    updatePlannerShowcase,
    sync,
    renderRoute,
    applyBreakPlanToCurrentItinerary,
  } = ctx;

  const navHistory = [];

  function switchToView(viewId, navIdx = 0) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach((b, i) => {
      b.classList.toggle('active', i === navIdx);
    });
    const state = getState();
    if (viewId === 'map-view' && state.map) {
      setTimeout(() => state.map.invalidateSize(), 100);
    }
  }

  function goBack() {
    if (navHistory.length === 0) {
      switchToView('plan-view', 1);
      return;
    }
    const prev = navHistory.pop();
    switchToView(prev.viewId, prev.idx);
  }

  function resetTrimNotice() {}

  function switchDay(idx) {
    const state = getState();
    state.dayIdx = idx;
    if (state.mdPlan && state.mdPlan[idx]) {
      state.itin = state.mdPlan[idx];
    }
    renderTabs();
    updateItinUI();
    if (renderRoute) renderRoute();
  }

  function renderTabs() {
    const state = getState();
    const container = document.getElementById('day-tabs');
    if (!container) return;
    if (!state.mdPlan || state.mdPlan.length <= 1) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = '';
    state.mdPlan.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.className = `day-tab ${i === state.dayIdx ? 'active' : ''}`;
      btn.textContent = `Day ${i + 1}`;
      btn.onclick = () => switchDay(i);
      container.appendChild(btn);
    });
  }

  function updateItinUI() {
    const state = getState();
    const list = document.getElementById('itin-list');
    if (!list) return;
    list.innerHTML = '';

    if (!state.itin || !state.itin.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">No places scheduled for this day.</p></div>';
      return;
    }

    let tv = 0, tt = 0, dayBudgetTotal = 0;
    let ft = '--:--';
    try {
      const timed = state.itin.filter(s => !s.isBreak && (s.etd || s.ets || s.leaveAt));
      if (timed.length) {
        timed.sort((a, b) => {
          const ta = a.etd instanceof Date ? a.etd.getTime() : t2m(a.leaveAt || a.ets || '00:00');
          const tb = b.etd instanceof Date ? b.etd.getTime() : t2m(b.leaveAt || b.ets || '00:00');
          return ta - tb;
        });
        const last = timed[timed.length - 1];
        ft = last.ets || last.leaveAt || '--:--';
      }
    } catch (_e) {
      ft = state.itin[state.itin.length - 1]?.ets || '--:--';
    }

    const imgs = {
      beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=96&h=96&fit=crop',
      temple: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=96&h=96&fit=crop',
      food: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=96&h=96&fit=crop',
      scenic: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=96&h=96&fit=crop',
      trekking: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=96&h=96&fit=crop',
      shopping: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=96&h=96&fit=crop',
    };

    const startMin = t2m(document.getElementById('s-time')?.value || '09:00');
    const dow = new Date().getDay();

    state.itin.forEach((loc, i) => {
      tv += loc.vt || 45;
      tt += loc.tt || 0;
      const isN = i === 0 && state.tripActive;

      if (loc.isBreak) {
        const breakCard = document.createElement('div');
        breakCard.className = 'break-card fade-in';
        breakCard.innerHTML = `<div class="break-card-top"><div class="break-card-title">☕ ${escapeHtml(loc.name)}</div><div class="dur-badge">${fmtM(loc.vt)}</div></div><div class="break-card-copy">Pause at ${loc.sts || '--'} and give yourself a short reset before the next stretch of the day.</div><div class="break-card-tags"><span class="break-tag">🕒 ${loc.sts || '--'} to ${loc.ets || '--'}</span><span class="break-tag">💧 Water reset</span><span class="break-tag">🧘 ${loc.climateNote || 'Slow down for a moment'}</span></div>`;
        list.appendChild(breakCard);
        const nextStop = state.itin[i + 1];
        if (nextStop && !nextStop.isBreak) {
          const c = document.createElement('div');
          c.className = 'drive-connector';
          c.innerHTML = `↓ 🚗 ${fmtM(nextStop.tt)} drive`;
          list.appendChild(c);
        }
        return;
      }

      const prevCoords = i > 0 ? state.itin[i - 1].coords : (getCityCenter() || loc.coords);
      const arriveMin = loc.std ? (loc.std.getHours() * 60 + loc.std.getMinutes()) : (startMin + tt);
      const transport = getTransportOptions(prevCoords, loc.coords, state.currentCityId, arriveMin);
      const trafficInfo = getTrafficLevel(transport.trafficMult);
      const crowdMult = getCrowdMultiplier(loc, dow, arriveMin);
      const crowdInfo = getCrowdLevel(crowdMult);
      const stopBudget = calculateStopBudget(loc, prevCoords, state.currentCityId);
      dayBudgetTotal += stopBudget.total;
      const km = transport.km;
      const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.coords[0]},${loc.coords[1]}`;
      const gmFood = `https://www.google.com/maps/search/restaurants+near+${encodeURIComponent(loc.name)}`;
      const foodLinksHTML = `<div class="food-links"><a href="${gmFood}" target="_blank" class="food-link fl-maps" style="flex:none;padding:5px 10px">🍴 Food Nearby</a></div>`;
      const planMeta = [loc.slotLabel, loc.climateNote].filter(Boolean).join(' • ');

      const weatherBadge = loc.weatherComfortBadge || loc.weather?.comfortBadge || '';
      const scenicBadge = loc.scenicBadge || (loc.is_sunset_spot ? '🌅 Sunset View' : '');
      const crowdBadgeStr = loc.crowdBadge || `${crowdInfo.emoji} ${crowdInfo.label}`;
      const dnaBadgeHTML = loc.dnaMatch?.score ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(168,85,247,0.15);color:#d8b4fe;border:1px solid rgba(168,85,247,0.25);font-weight:600;">🧬 ${loc.dnaMatch.score}% Fit</span>` : '';

      const smartBadgesHTML = `<div class="smart-time-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        <span class="traffic-badge ${trafficInfo.level}">${trafficInfo.emoji} ${trafficInfo.label}</span>
        <span class="crowd-badge ${crowdInfo.level}">${crowdBadgeStr}</span>
        ${weatherBadge ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);font-weight:600;">${weatherBadge}</span>` : ''}
        ${scenicBadge ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(251,146,60,0.15);color:#fb923c;border:1px solid rgba(251,146,60,0.25);font-weight:600;">${scenicBadge}</span>` : ''}
        ${dnaBadgeHTML}
      </div>`;

      const div = document.createElement('div');
      div.className = 'stop-card' + (isN ? ' is-next' : '') + ' fade-in';
      const nextStop = state.itin[i + 1];
      const gmapNav = (loc.coords && nextStop?.coords)
        ? `https://www.google.com/maps/dir/?api=1&origin=${loc.coords[0]},${loc.coords[1]}&destination=${nextStop.coords[0]},${nextStop.coords[1]}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${loc.coords[0]},${loc.coords[1]}&travelmode=driving`;

      div.innerHTML = `<div class="dur-badge">${fmtM(loc.vt || 45)}</div>
        <div class="sc-row">
          <img src="${imgs[loc.cat] || imgs.scenic}" class="sc-img" alt="${escapeHtml(loc.name)}">
          <div class="sc-body">
            <div class="sc-name">${escapeHtml(loc.name)}</div>
            <div class="sc-sub">${planMeta ? `${planMeta}<br>` : ''}🕒 ${loc.ot || '--'} – ${loc.ct || '--'}</div>
            <div class="sc-times"><span class="time-tag">${loc.sts || loc.arriveAt || '--'}</span><span style="color:var(--text-muted);font-size:10px">→</span><span class="time-tag">${loc.ets || loc.leaveAt || '--'}</span></div>
            ${smartBadgesHTML}
            <div style="margin-top:4px;">${getTimeBadgesHtml ? getTimeBadgesHtml(loc, loc.arriveMin) : ''}</div>
          </div>
        </div>
        ${foodLinksHTML}
        <div class="sc-actions">
          <a href="${gmapNav}" target="_blank" class="sc-action" title="Navigate in Google Maps" style="font-size:18px">🗺️</a>
          <a href="${sv}" target="_blank" class="sc-action" title="Street View" style="font-size:18px">👀</a>
        </div>`;
      list.appendChild(div);

      if (nextStop && !nextStop.isBreak) {
        const nextKm = (loc.coords && nextStop.coords)
          ? Math.round(hvKm(loc.coords[0], loc.coords[1], nextStop.coords[0], nextStop.coords[1]) * 1.42 * 10) / 10
          : null;
        const distLabel = nextKm ? `${nextKm} km road · ` : '';
        const c = document.createElement('div');
        c.className = 'drive-connector';
        c.innerHTML = `↓ 🚗 ${distLabel}${fmtM(nextStop.tt)} drive <a href="${gmapNav}" target="_blank" style="margin-left:6px;color:var(--brand,#38bdf8);text-decoration:none;font-weight:700;font-size:11px;">🗺️ Route</a>`;
        list.appendChild(c);
      }
    });

    const stTravel = document.getElementById('st-travel');
    const stVisit = document.getElementById('st-visit');
    const stFinish = document.getElementById('st-finish');
    if (stTravel) stTravel.textContent = fmtM(tt);
    if (stVisit) stVisit.textContent = fmtM(tv);
    if (stFinish) stFinish.textContent = ft;

    updatePlannerShowcase();
  }

  return {
    switchToView,
    goBack,
    resetTrimNotice,
    switchDay,
    renderTabs,
    updateItinUI,
  };
}
