function escapeHtml(s) {
  if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// travel-intel-ui.js — Travel Intelligence UI helpers (extracted from app monolith)
// Imported by the Vite app entry; browser globals (escapeHtml, API, etc.) expected at runtime.

export function ti_renderIntelligenceCard(place, state){
  const score = state.visitScore != null ? state.visitScore : '—';
  const label = state.visitLabel || '';
  const conf = state.confidence ? `${state.confidence.level || ''} — ${state.confidence.confidence ?? ''}%` : '';
  const crowd = state.crowd?.level || state.crowdLevel || '—';
  const wx = state.weather?.suitability || '—';
  const traffic = state.traffic?.trafficLevel || state.traffic?.level || '—';
  const scenic = state.scenic?.suitability || '—';
  const why = (state.explanation?.bullets || []).slice(0, 6).map(b => {
    const icon = b.type === 'positive' ? '✓' : b.type === 'caution' ? '!' : '·';
    return `${icon} ${b.text}`;
  }).join('<br>') || (state.explanation?.summary || '');
  const depart = state.arrival?.recommendedDeparture || '';
  const window = state.scenic?.bestScenicWindow
    ? `${state.scenic.bestScenicWindow.start || ''} – ${state.scenic.bestScenicWindow.end || ''}`
    : (state.arrival?.experienceWindow ? `${state.arrival.experienceWindow.start} – ${state.arrival.experienceWindow.end}` : '');
  const sourceNote = state.crowd?.source ? `Crowd source: ${state.crowd.source}` : '';
  return `
<div style="border:1px solid var(--border-subtle,#333);border-radius:14px;padding:14px 16px;background:var(--bg-layer2,#1a1a1a);max-width:420px;font-size:13px;line-height:1.45;">
  <div style="font-size:11px;letter-spacing:.04em;opacity:.7;margin-bottom:4px;">BEST TIME TO VISIT</div>
  <div style="font-weight:700;font-size:16px;margin-bottom:2px;">${escapeHtml(place.name)}</div>
  <div style="opacity:.9;margin-bottom:8px;">${escapeHtml(state.statusLabel || '')}</div>
  ${window ? `<div style="margin-bottom:6px;">🕐 ${escapeHtml(window)}</div>` : ''}
  <div style="font-size:18px;font-weight:700;margin:8px 0;">⭐ ${score}/100 ${escapeHtml(label)}</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;font-size:12px;">
    <span>👥 Crowd ${escapeHtml(String(crowd))}</span>
    <span>🌦 Weather ${escapeHtml(String(wx))}</span>
    <span>🚗 Traffic ${escapeHtml(String(traffic))}</span>
    <span>🌅 Scenic ${escapeHtml(String(scenic))}</span>
  </div>
  ${why ? `<div style="margin-top:8px;"><div style="font-size:11px;opacity:.7;margin-bottom:4px;">WHY?</div>${why}</div>` : ''}
  ${depart ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-subtle,#333);">Recommended departure <strong>${escapeHtml(depart)}</strong></div>` : ''}
  ${conf ? `<div style="margin-top:6px;font-size:11px;opacity:.75;">Confidence: ${escapeHtml(conf)}</div>` : ''}
  ${sourceNote ? `<div style="margin-top:4px;font-size:10px;opacity:.6;">${escapeHtml(sourceNote)}</div>` : ''}
</div>`.trim();
}

export function getTravelIntelPanelHtml(loc) {
  const ti = loc && loc._ti;
  if (!ti || ti.visitScore == null) return '';
  const why = (ti.explanation && ti.explanation.bullets) ? ti.explanation.bullets.slice(0, 4).map(b => {
    const icon = b.type === 'positive' ? '✓' : b.type === 'caution' ? '!' : '·';
    return `${icon} ${b.text}`;
  }).join('<br>') : (ti.explanation && ti.explanation.summary) || '';
  const depart = ti.arrival && ti.arrival.recommendedDeparture ? ti.arrival.recommendedDeparture : '';
  return `<div class="ti-panel" style="margin-top:8px;padding:10px;border-radius:10px;border:1px solid var(--border-subtle,#333);background:var(--bg-layer2,#1a1a1a);font-size:11px;line-height:1.4;">
    <div style="font-weight:600;margin-bottom:4px;">Travel Intelligence · ⭐ ${ti.visitScore}/100 ${ti.visitLabel||''}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;opacity:.9;">
      <span>👥 ${ti.crowdLevel||ti.crowd?.level||'—'}</span>
      <span>🌦 ${ti.weather?.suitability||'—'}</span>
      <span>🚗 ${ti.traffic?.trafficLevel||'—'}</span>
      <span>🌅 ${ti.scenic?.suitability||'—'}</span>
    </div>
    ${why ? `<div style="margin-top:6px;opacity:.85;">${why}</div>` : ''}
    ${depart ? `<div style="margin-top:6px;">Leave ~<strong>${depart}</strong></div>` : ''}
  </div>`;
}

export async function enrichPlacesWithTravelIntel(places, limit = 30) {
  try {
    if (!places || !places.length || !window.API || !API.timeIntelligenceStatus) return;
    const slice = places.slice(0, limit);
    const weather = { tempC: typeof realTemp === 'number' ? realTemp : null, condition: realWeatherMain || null, windKph: window.realWind };
    const { places: states } = await API.timeIntelligenceStatus(slice.map(ti_placePayload), weather);
    if (!Array.isArray(states)) return;
    const byName = Object.fromEntries(states.map(s => [s.name, s]));
    places.forEach(p => { if (byName[p.name]) p._ti = byName[p.name]; });
  } catch (e) {
    console.warn('[TI enrich]', e.message || e);
  }
}

