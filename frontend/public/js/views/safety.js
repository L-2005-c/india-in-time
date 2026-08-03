// ══════════════════════════════════════════════════
// Safety View — replaces renderSafety() with onclick= → data-action
// ══════════════════════════════════════════════════
import { escapeHtml } from '../core/dom.js';
import { registerActions } from '../core/events.js';

export function renderSafety(deps) {
  const { state } = deps;
  const cityQuery = encodeURIComponent(`${state.currentCityName} hospitals`);
  const nearbyQuery = encodeURIComponent(
    state.cLat && state.cLon
      ? `${state.cLat},${state.cLon} hospitals`
      : `hospitals near ${state.currentCityName}`
  );

  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🚨 Emergency Safety</div></div><div class="emergency-block"><div class="emergency-block-title">Urgent Help</div><div class="emergency-list"><a href="tel:112" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">National Emergency</span></div><span class="emer-num">112</span></a><a href="tel:100" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">Police</span></div><span class="emer-num">100</span></a><a href="tel:108" class="emer-card"><div class="emer-left"><span class="emer-ico">🚑</span><span class="emer-name">Ambulance</span></div><span class="emer-num">108</span></a><a href="tel:101" class="emer-card"><div class="emer-left"><span class="emer-ico">🚒</span><span class="emer-name">Fire</span></div><span class="emer-num">101</span></a><a href="tel:1091" class="emer-card"><div class="emer-left"><span class="emer-ico">👩</span><span class="emer-name">Women Helpline</span></div><span class="emer-num">1091</span></a></div></div><div class="emergency-block"><div class="emergency-block-title">Hospitals</div><div class="emergency-list"><a href="https://www.google.com/maps/search/?api=1&query=${nearbyQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🏥</span><span class="emer-name">Nearby Hospitals</span></div><span class="emer-num">Open</span></a><a href="https://www.google.com/maps/search/?api=1&query=${cityQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🩺</span><span class="emer-name">${escapeHtml(state.currentCityName)} Hospitals</span></div><span class="emer-num">Maps</span></a></div></div><button class="emer-share-btn" data-action="shareEmergency">📍 Share My Live Location</button>`;
}

export function registerSafetyActions(deps) {
  registerActions({
    shareEmergency: () => deps.shareEmergency(),
  });
}
