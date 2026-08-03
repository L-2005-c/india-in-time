// ══════════════════════════════════════════════════
// Itinerary View — replacing updateItinUI()
// Replaces inline onclick= handlers with data-action delegation
// ══════════════════════════════════════════════════
import { state } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { fmtM, t2m } from '../core/utils.js';
import { getTransportOptions, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, calculateStopBudget, calculateTripBudget, renderBudgetBreakdown } from '../engine/routing.js';
import { getTimeBadgesHtml } from '../engine/timeIntelligence.js';
import { registerActions } from '../core/events.js';

export function updateItinUI(deps) {
  const list = document.getElementById('plan-list');
  if (!list) return;
  list.innerHTML = '';
  
  if (!state.itin || !state.itin.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏁</div><p class="empty-txt">All done for today!</p><p class="empty-sub">The current day has no remaining stops.</p></div>';
    const sf = document.getElementById('st-finish');
    if (sf) sf.textContent = '--:--';
    if (deps.updatePlannerShowcase) deps.updatePlannerShowcase();
    return;
  }
  
  let tv = 0, tt = 0, dayBudgetTotal = 0;
  const ft = state.itin[state.itin.length - 1]?.ets || '--:--';
  const imgs = {
    beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=96&h=96&fit=crop',
    temple: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=96&h=96&fit=crop',
    food: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=96&h=96&fit=crop',
    scenic: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=96&h=96&fit=crop'
  };
  
  const startMin = t2m(document.getElementById('s-time')?.value || '09:00');
  const dow = new Date().getDay();
  
  state.itin.forEach((loc, i) => {
    tv += loc.vt || 0;
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
    
    const prevCoords = i > 0 ? state.itin[i - 1].coords : (deps.getCityCenter ? deps.getCityCenter() : loc.coords);
    const arriveMin = loc.std ? (loc.std.getHours() * 60 + loc.std.getMinutes()) : (startMin + tt);
    
    const transport = getTransportOptions(prevCoords, loc.coords, state.currentCityId, arriveMin);
    const trafficMult = transport.trafficMult;
    const trafficInfo = getTrafficLevel(trafficMult);
    const crowdMult = getCrowdMultiplier(loc, dow, arriveMin);
    const crowdInfo = getCrowdLevel(crowdMult);
    
    const stopBudget = calculateStopBudget(loc, prevCoords, state.currentCityId);
    dayBudgetTotal += stopBudget.total;
    const km = transport.km;
    
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.coords[0]},${loc.coords[1]}`;
    const zomato = `https://www.zomato.com/search?q=${encodeURIComponent(loc.name)}`;
    const swiggy = `https://www.swiggy.com/search?query=${encodeURIComponent(loc.name)}`;
    const gmFood = `https://www.google.com/maps/search/restaurants+near+${encodeURIComponent(loc.name)}`;
    
    const foodLinksHTML = loc.cat === 'food' 
      ? `<div class="food-links"><a href="${zomato}" target="_blank" class="food-link fl-zomato">🍽️ Zomato</a><a href="${swiggy}" target="_blank" class="food-link fl-swiggy">🛵 Swiggy</a><a href="${gmFood}" target="_blank" class="food-link fl-maps">📍 Nearby</a></div>` 
      : `<div class="food-links"><a href="${gmFood}" target="_blank" class="food-link fl-maps" style="flex:none;padding:5px 10px">🍴 Food Nearby</a></div>`;
      
    const wxBadgeHTML = `<div class="wx-alert good" id="wx-${loc.id}" style="display:none"></div>`;
    const planMeta = [loc.slotLabel, loc.climateNote].filter(Boolean).join(' • ');
    
    const transportHTML = km > 0.1 ? `<div class="transport-grid">${transport.options.map(opt => {
      let badge = '';
      if(opt.isFastest) badge = '<span class="transport-badge fastest">⚡Fast</span>';
      else if(opt.isCheapest) badge = '<span class="transport-badge cheapest">💰Best</span>';
      return `<a href="${opt.link}" target="_blank" class="transport-card">${badge}<div class="t-icon">${opt.icon}</div><div class="t-mode">${opt.label}</div><div class="t-fare">${opt.fareStr}</div><div class="t-time">~${fmtM(opt.time)}</div></a>`;
    }).join('')}</div>` : '';
    
    const smartBadgesHTML = `<div class="smart-time-row"><span class="traffic-badge ${trafficInfo.level}">${trafficInfo.emoji} ${trafficInfo.label}</span><span class="crowd-badge ${crowdInfo.level}">${crowdInfo.emoji} ${crowdInfo.label}</span></div>`;
    
    let nearestSpot = null;
    let minD = Infinity;
    if (state.LOCS && state.LOCS.length && deps.hvKm) {
      for (const spot of state.LOCS) {
        if (spot.id === loc.id || spot.name === loc.name) continue;
        if (spot.cat === 'food' || spot.cat === 'break' || spot.isBreak) continue;
        const d = deps.hvKm(loc.coords[0], loc.coords[1], spot.coords[0], spot.coords[1]);
        if (d < minD) { minD = d; nearestSpot = spot; }
      }
    }
    const nearestSpotHTML = nearestSpot ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;">📍 Nearest spot: <strong>${escapeHtml(nearestSpot.name)}</strong> (~${minD.toFixed(1)} km)</div>` : '';
    
    const div = document.createElement('div');
    div.className = 'stop-card' + (isN ? ' is-next' : '') + ' fade-in';
    
    // THE XSS FIX: Replace onclick="aiFoodCard('${loc.name...}')" with data-action
    div.innerHTML = `<div class="dur-badge">${fmtM(loc.vt)}</div>
      <div class="sc-row">
        <img src="${imgs[loc.cat] || imgs.scenic}" class="sc-img" alt="${escapeAttr(loc.name)}" onerror="this.style.display='none'">
        <div class="sc-body">
          <div class="sc-name">${escapeHtml(loc.name)}</div>
          <div class="sc-sub">${planMeta ? `${planMeta}<br>` : ''}🕒 ${loc.ot} – ${loc.ct}</div>
          <div class="sc-times">
            <span class="time-tag">${loc.sts || '--'}</span>
            <span style="color:var(--text-muted);font-size:10px">→</span>
            <span class="time-tag">${loc.ets || '--'}</span>
          </div>
          ${smartBadgesHTML}
          <div style="margin-top:4px;">${getTimeBadgesHtml(loc, loc.arriveMin)}</div>
          ${nearestSpotHTML}
        </div>
      </div>
      ${wxBadgeHTML}${transportHTML}${foodLinksHTML}
      <div class="sc-actions">
        <a href="${sv}" target="_blank" class="sc-action" title="Street View" style="font-size:18px">👀</a>
        <button data-action="aiFoodCard" data-name="${escapeAttr(loc.name)}" data-cat="${escapeAttr(loc.cat)}" class="sc-action" title="AI Food Guide" style="font-size:18px;cursor:pointer">🍽️</button>
      </div>`;
    list.appendChild(div);
    
    const nextStop = state.itin[i + 1];
    if (nextStop && !nextStop.isBreak) {
      const c = document.createElement('div');
      c.className = 'drive-connector';
      c.innerHTML = `↓ 🚗 ${fmtM(nextStop.tt)} drive`;
      list.appendChild(c);
    }
  });
  
  const st = document.getElementById('st-travel');
  if (st) st.textContent = fmtM(tt);
  const v = document.getElementById('st-visit');
  if (v) v.textContent = fmtM(tv);
  const sf = document.getElementById('st-finish');
  if (sf) sf.textContent = ft;
  
  const startCoords = deps.getCityCenter ? deps.getCityCenter() : state.itin[0]?.coords;
  if (state.mdPlan && state.mdPlan.length > 0) {
    state.tripBudgetData = calculateTripBudget(state.mdPlan, state.currentCityId, startCoords);
  }
  renderBudgetBreakdown();
  
  const budgetEl = document.getElementById('st-budget');
  if (budgetEl) {
    const dayBud = state.tripBudgetData?.days?.[state.dayIdx];
    budgetEl.textContent = dayBud ? `₹${dayBud.total.toLocaleString('en-IN')}` : `₹${dayBudgetTotal.toLocaleString('en-IN')}`;
  }
  
  const budChip = document.getElementById('plan-summary-chip-budget');
  if (budChip && state.tripBudgetData) {
    budChip.style.display = 'inline-flex';
    budChip.textContent = `💰 Est. ₹${state.tripBudgetData.grandTotal.total.toLocaleString('en-IN')}`;
  }
  
  if (deps.updatePlannerShowcase) deps.updatePlannerShowcase();
}

export function registerItineraryActions(deps) {
  registerActions({
    aiFoodCard: (btn) => {
      const name = btn.dataset.name;
      const cat = btn.dataset.cat;
      if (name && deps.aiFoodCard) deps.aiFoodCard(name, cat);
    }
  });
}
