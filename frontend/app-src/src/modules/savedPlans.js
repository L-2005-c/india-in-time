// frontend/app-src/src/modules/savedPlans.js
// Saved trips management, local device persistence, cloud sync, and itinerary sharing.

export const LOCAL_PLANS_KEY = 'india_in_time_saved_plans_v1';

export function readLocalPlans() {
  try {
    const raw = localStorage.getItem(LOCAL_PLANS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_e) {
    return [];
  }
}

export function writeLocalPlans(list) {
  try {
    localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(list.slice(0, 40)));
  } catch (_e) {
    /* quota / private mode */
  }
}

export function serializeCurrentPlan({ currentCityName, currentCityId, cLat, cLon, mdPlan, getTripMinutes }) {
  const st = document.getElementById('s-time')?.value || '09:00';
  const et = document.getElementById('e-time')?.value || '';
  const tm = typeof getTripMinutes === 'function' ? getTripMinutes() : 0;
  return {
    id: 'local-' + Date.now(),
    city: currentCityName || currentCityId || 'Unknown',
    cityLat: typeof cLat === 'number' ? cLat : null,
    cityLon: typeof cLon === 'number' ? cLon : null,
    st,
    et,
    tm,
    data: JSON.stringify(mdPlan || []),
    savedAt: new Date().toISOString(),
  };
}

export async function savePlan({ mdPlan, currentCityName, currentCityId, cLat, cLon, getTripMinutes, currentUser, API, addMsg }) {
  if (!mdPlan || !mdPlan.length) {
    addMsg('Generate a plan first, then save it.');
    return;
  }
  const payload = serializeCurrentPlan({ currentCityName, currentCityId, cLat, cLon, mdPlan, getTripMinutes });

  // Always keep a local copy so offline / unsigned users still have it
  const local = readLocalPlans();
  local.unshift(payload);
  writeLocalPlans(local);

  // Cloud save when signed in + API available
  if (currentUser && API?.saveTrip) {
    try {
      const stops = (mdPlan || [])
        .flat()
        .filter(Boolean)
        .map((s) => ({
          id: s.id,
          name: s.name,
          cat: s.cat,
          coords: s.coords,
          sts: s.sts,
          ets: s.ets,
          vt: s.vt,
          tt: s.tt,
        }));
      const tripConfig = {
        startTime: payload.st,
        endTime: payload.et,
        tripMinutes: payload.tm,
        multiDay: mdPlan,
      };
      const res = await API.saveTrip(payload.city, payload.cityLat, payload.cityLon, tripConfig, stops);
      addMsg(`☁️ Saved to cloud${res?.id ? ` (id: ${String(res.id).slice(0, 8)}…)` : ''}. Also kept on this device.`);
      return;
    } catch (err) {
      console.warn('[savePlan] cloud save failed, local copy kept', err);
      addMsg('💾 Saved on this device. Sign in again to sync to the cloud.');
      return;
    }
  }

  addMsg('💾 Plan saved on this device. Sign in with Google to sync to the cloud.');
}

export function deletePlan(id, { currentUser, API, renderSavedPlansList, addMsg }) {
  if (!id) return;
  const next = readLocalPlans().filter((p) => p.id !== id);
  writeLocalPlans(next);

  if (API?.deleteTrip && currentUser && !String(id).startsWith('local-')) {
    API.deleteTrip(id).catch((err) => console.warn('[deletePlan]', err));
  }

  const list = document.getElementById('plan-list');
  if (list && list.dataset.mode === 'saved') {
    renderSavedPlansList();
  } else {
    addMsg('🗑️ Plan deleted.');
  }
}

export function renderSavedPlansListUI({ currentUser, API, escapeHtml }) {
  const list = document.getElementById('plan-list');
  if (!list) return;
  list.dataset.mode = 'saved';
  const local = readLocalPlans();

  const renderItems = (items, sourceLabel) => {
    if (!items.length) return '';
    return items
      .map((p) => {
        const when = p.savedAt ? new Date(p.savedAt).toLocaleString() : '';
        const stops = (() => {
          try {
            const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.stops || p.multiDay || [];
            const flat = Array.isArray(d?.[0]) ? d.flat() : d;
            return Array.isArray(flat) ? flat.length : 0;
          } catch {
            return p.stopsCount || 0;
          }
        })();
        const encoded = encodeURIComponent(
          JSON.stringify({
            data: typeof p.data === 'string' ? p.data : JSON.stringify(p.multiDay || p.stops || []),
            st: p.st || p.config?.startTime || '09:00',
            et: p.et || p.config?.endTime || '',
            tm: p.tm || p.config?.tripMinutes || 0,
          })
        );
        return `<div class="saved-plan-card" style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;margin:6px 0;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:13px">${escapeHtml ? escapeHtml(p.city || 'Trip') : p.city || 'Trip'}</div>
          <div style="font-size:11px;opacity:.7">${stops} stops${when ? ' · ' + when : ''} · ${sourceLabel}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="itn-btn itnb-green" data-action="loadPlan" data-plan="${encoded}" style="padding:6px 10px;font-size:12px">Load</button>
          <button class="itn-btn" data-action="delPlan" data-id="${p.id}" style="padding:6px 10px;font-size:12px">🗑️</button>
        </div>
      </div>`;
      })
      .join('');
  };

  let html = '<div class="sec-label" style="padding:8px 0">Saved plans</div>';
  html +=
    renderItems(local, 'this device') ||
    '<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">No local plans yet. Generate one and tap Save.</p></div>';

  list.innerHTML = html;

  if (currentUser && API?.listTrips) {
    API.listTrips()
      .then((res) => {
        const trips = res?.trips || res || [];
        if (!Array.isArray(trips) || !trips.length) return;
        const cloudHtml = trips
          .map((t) => {
            const when = t.createdAt ? new Date(t.createdAt).toLocaleString() : '';
            return `<div class="saved-plan-card" style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;margin:6px 0;border-radius:12px;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.15)">
          <div style="min-width:0">
            <div style="font-weight:600;font-size:13px">${t.city || 'Trip'}</div>
            <div style="font-size:11px;opacity:.7">${t.stopsCount || '?'} stops${when ? ' · ' + when : ''} · cloud</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="itn-btn itnb-green" data-action="loadCloudPlan" data-id="${t.id}" style="padding:6px 10px;font-size:12px">Load</button>
            <button class="itn-btn" data-action="delPlan" data-id="${t.id}" style="padding:6px 10px;font-size:12px">🗑️</button>
          </div>
        </div>`;
          })
          .join('');
        list.insertAdjacentHTML('beforeend', '<div class="sec-label" style="padding:12px 0 4px">Cloud</div>' + cloudHtml);
      })
      .catch(() => {});
  }
}

export function shareTripText(mdPlan, currentCityName, { addMsg }) {
  if (!mdPlan.length) return;
  let t = `🇮🇳 My ${currentCityName} Trip:\n\n`;
  mdPlan.forEach((d, i) => {
    t += `Day ${i + 1}:\n`;
    d.forEach((l, j) => (t += `${j + 1}. ${l.name} (${l.sts || '--'}–${l.ets || '--'})\n`));
  });
  t += '\nIndia In-Time 🚀';
  if (navigator.share) navigator.share({ title: `${currentCityName} Trip`, text: t }).catch(() => {});
  else navigator.clipboard?.writeText(t).then(() => addMsg('📋 Copied!'));
}

export function shareTripWhatsApp(mdPlan, currentCityName, { addMsg }) {
  if (!mdPlan.length) {
    addMsg('Generate a plan first!');
    return;
  }
  let t = `🇮🇳 *My ${currentCityName} Trip*\n\n`;
  const icons = { beach: '🏖️', temple: '🛕', food: '🍛', scenic: '⛰️' };
  mdPlan.forEach((d, i) => {
    if (mdPlan.length > 1) t += `*Day ${i + 1}*\n`;
    d.forEach((l) => (t += `${icons[l.cat] || '📍'} *${l.name}* — ${l.sts || '--'}–${l.ets || '--'}\n`));
    t += '\n';
  });
  window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
}

export function shareTripEmergency(cLat, cLon) {
  if (!cLat || !cLon) {
    alert('GPS not available.');
    return;
  }
  const t = `🚨 EMERGENCY: https://maps.google.com/?q=${cLat},${cLon}`;
  if (navigator.share) navigator.share({ title: 'Emergency', text: t }).catch(() => navigator.clipboard?.writeText(t));
  else navigator.clipboard?.writeText(t);
}
