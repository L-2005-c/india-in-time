// ══════════════════════════════════════════════════
// Load Panel View — replaces renderLoadPanel()
// onclick="loadPlan('...')" → data-action="loadPlan" data-plan-id="..."
// onclick="delPlan('...')" → data-action="delPlan" data-plan-id="..."
// ══════════════════════════════════════════════════
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { registerActions } from '../core/events.js';

export function renderLoadPanel(deps) {
  const { state } = deps;
  let local = [];
  try { local = JSON.parse(localStorage.getItem('tt_plans') || '[]'); } catch (e) {}
  const cloud = window._fbPlans || [];
  const seen = new Set();
  const all = [...cloud, ...local]
    .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .sort((a, b) => b.ts - a.ts);

  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">📂 My Saved Plans ${state.currentUser ? '☁️' : ''}</div></div>${all.length === 0
    ? '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px;font-style:italic">No saved plans yet.</p>'
    : all.map(d => `<div class="saved-plan-item"><div><div class="sp-name">${escapeHtml(d.name)}</div><div class="sp-date">${new Date(d.ts).toLocaleString()} ${cloud.find(c => c.id === d.id) ? '☁️' : ''}</div></div><div class="sp-btns"><button class="sp-load" data-action="loadPlanById" data-plan-id="${escapeAttr(d.id)}" data-plan-data="${escapeAttr(encodeURIComponent(JSON.stringify(d)))}">Load</button><button class="sp-del" data-action="delPlanById" data-plan-id="${escapeAttr(d.id)}">×</button></div></div>`).join('')}`;
}

export function registerLoadPanelActions(deps) {
  registerActions({
    loadPlanById: (btn) => {
      const data = btn.dataset.planData;
      if (data && deps.loadPlan) deps.loadPlan(data);
    },
    delPlanById: (btn) => {
      const id = btn.dataset.planId;
      if (id && deps.delPlan) {
        deps.delPlan(id);
        renderLoadPanel(deps);
      }
    },
  });
}
