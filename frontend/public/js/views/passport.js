// ══════════════════════════════════════════════════
// Passport View — replaces renderPassport()
// onclick="chatAbout('...')" → data-action="chatAbout" data-name="..."
// ══════════════════════════════════════════════════
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { registerActions } from '../core/events.js';

export function renderPassport(deps) {
  const { state } = deps;
  const catIcon = { beach: '🏖️', temple: '🛕', food: '🍛', scenic: '⛰️' };

  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🛂 Passport — ${state.stamps.size} Stamps</div></div><p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-align:center">Visit places to collect stamps!</p><div class="passport-grid">${state.LOCS.map(loc => {
    const u = state.stamps.has(loc.id);
    return `<div class="passport-stamp${u ? ' unlocked' : ''}" ${u ? `data-action="chatAbout" data-name="${escapeAttr(loc.name)}"` : ''} style="${!u ? 'opacity:0.55;filter:grayscale(1)' : 'cursor:pointer'}"><div class="stamp-icon">${u ? catIcon[loc.cat] || '📍' : '🔒'}</div><div class="stamp-name${u ? ' unlocked' : ''}">${escapeHtml(loc.name)}</div>${u ? '<div class="stamp-badge">✓</div>' : ''}</div>`;
  }).join('')}</div>`;
}

export function registerPassportActions(deps) {
  registerActions({
    chatAbout: (btn) => {
      const name = btn.dataset.name;
      if (name && deps.chatAbout) deps.chatAbout(name);
    },
  });
}
