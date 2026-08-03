// ══════════════════════════════════════════════════
// Budget View — replaces renderBudget() and updateBudget()
// All onclick= handlers replaced with data-action delegation
// ══════════════════════════════════════════════════
import { escapeHtml } from '../core/dom.js';
import { registerActions } from '../core/events.js';

export function renderBudgetView(deps) {
  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">💸 Budget Splitter</div></div><div class="budget-card"><div class="budget-row"><div class="bud-field-wrap"><div class="inp-lbl">Total Budget</div><div class="bud-currency"><span class="bud-sym">₹</span><input type="number" class="bud-inp" id="bud-limit" value="5000" data-action="updateBudget"></div></div><div class="bud-field-wrap"><div class="inp-lbl">Group Size</div><div class="bud-currency"><span style="font-size:18px">👥</span><input type="number" class="bud-inp" id="grp-sz" value="1" min="1" style="width:50px" data-action="updateBudget"></div></div><div class="bud-field-wrap" style="text-align:right"><div class="inp-lbl">Remaining</div><div class="bud-rem" id="bud-rem">₹5000</div></div></div><div class="prog-bar"><div class="prog-fill" id="bud-bar" style="width:0%"></div></div><div class="bud-meta"><span>Spent: <strong id="bud-spent">₹0</strong></span><span style="color:var(--purple);font-weight:700">Per person: <strong id="bud-pp">₹0.00</strong></span></div></div><div class="exp-add-row"><input type="text" id="exp-name" class="inp-field" placeholder="What did you buy?"><input type="number" id="exp-cost" class="inp-field small" placeholder="₹"><button class="btn-add-exp" data-action="addExpense">+</button></div><div class="exp-list" id="exp-list"><p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p></div><button class="btn-ai-budget" data-action="analyzeBudget">✨ AI Budget Analyzer</button>`;

  updateBudgetUI(deps);
}

/**
 * Update the budget UI (progress bar, spent/remaining, expense list).
 * Previously used inline onclick="delExp(${e.id})" — now uses
 * data-action="delExp" data-id="..."
 */
export function updateBudgetUI(deps) {
  const { state } = deps;
  const lim = parseFloat(document.getElementById('bud-limit')?.value) || 0;
  const grp = Math.max(1, parseInt(document.getElementById('grp-sz')?.value) || 1);
  const sp = state.expenses.reduce((s, e) => s + e.c, 0);
  const rem = lim - sp;

  const re = document.getElementById('bud-rem');
  if (re) {
    re.textContent = `₹${rem}`;
    re.style.color = rem < 0 ? '#f87171' : rem < lim * 0.2 ? '#fcd34d' : 'var(--jade)';
  }
  const ts = document.getElementById('bud-spent');
  if (ts) ts.textContent = `₹${sp}`;
  const pp = document.getElementById('bud-pp');
  if (pp) pp.textContent = `₹${(sp / grp).toFixed(2)}`;
  const pct = lim > 0 ? Math.min(100, (sp / lim) * 100) : 0;
  const pr = document.getElementById('bud-bar');
  if (pr) {
    pr.style.width = `${pct}%`;
    pr.style.background = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : 'var(--jade)';
  }

  const expEl = document.getElementById('exp-list');
  if (!expEl) return;
  expEl.innerHTML = state.expenses.length
    ? state.expenses.map(e =>
      `<div class="exp-item"><span>${escapeHtml(e.n)}</span><div class="exp-item-right"><span style="font-weight:700">₹${e.c}</span><button class="exp-del" data-action="delExp" data-id="${e.id}">×</button></div></div>`
    ).join('')
    : '<p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p>';
}

export function registerBudgetViewActions(deps) {
  registerActions({
    addExpense: () => {
      deps.addExpense();
      updateBudgetUI(deps);
    },
    delExp: (btn) => {
      const id = parseInt(btn.dataset.id, 10);
      if (!isNaN(id)) {
        deps.delExp(id);
        updateBudgetUI(deps);
      }
    },
    updateBudget: () => updateBudgetUI(deps),
    analyzeBudget: () => deps.analyzeBudget(),
  });
}
