/**
 * Budget domain — pure calculation + formatting (enterprise module boundary).
 * UI rendering stays in core until DOM coupling is removed; math lives here.
 */
export function calculateStopBudget(stop, prevCoords, cityId, helpers = {}) {
  const { hvKm, getTransportConfig } = helpers;
  if (!stop) return { transport: 0, entry: 0, food: 0, total: 0 };
  let transport = 0;
  if (prevCoords && stop.coords && typeof hvKm === 'function') {
    const km = hvKm(prevCoords[0], prevCoords[1], stop.coords[0], stop.coords[1]);
    const cfg = typeof getTransportConfig === 'function' ? getTransportConfig(cityId) : null;
    const rate = cfg?.autoPerKm || 15;
    transport = Math.round(Math.max(30, km * rate));
  }
  const entry = Number(stop.entryFee || stop.fee || 0) || 0;
  const food = stop.cat === 'food' ? Number(stop.estCost || 200) : 0;
  return { transport, entry, food, total: transport + entry + food };
}

export function calculateDayBudget(dayStops, cityId, startCoords, helpers = {}) {
  let prev = startCoords;
  const items = [];
  let transport = 0, entry = 0, food = 0, total = 0;
  for (const stop of dayStops || []) {
    const b = calculateStopBudget(stop, prev, cityId, helpers);
    items.push({ stop, ...b });
    transport += b.transport;
    entry += b.entry;
    food += b.food;
    total += b.total;
    if (stop.coords) prev = stop.coords;
  }
  return { items, transport, entry, food, total };
}

export function calculateTripBudget(plan, cityId, startCoords, helpers = {}) {
  const days = (plan || []).map((day, i) =>
    calculateDayBudget(Array.isArray(day) ? day : [day], cityId, i === 0 ? startCoords : null, helpers)
  );
  const grandTotal = days.reduce((s, d) => ({
    transport: s.transport + d.transport,
    entry: s.entry + d.entry,
    food: s.food + d.food,
    total: s.total + d.total,
  }), { transport: 0, entry: 0, food: 0, total: 0 });
  return { days, grandTotal };
}

export function formatInr(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}

export function renderBudgetBreakdownHTML(tripBudgetData, dayIdx, userBudget = 0) {
  if (!tripBudgetData) return '';
  const { days, grandTotal } = tripBudgetData;
  const overBudget = userBudget > 0 && grandTotal.total > userBudget;
  const budgetPct = userBudget > 0 ? Math.min(100, (grandTotal.total / userBudget) * 100) : 0;
  return `
    <div class="budget-opt-header">
      <div class="budget-opt-title">💰 Estimated Trip Budget</div>
      <div class="budget-opt-total" style="color:${overBudget ? '#f87171' : 'var(--jade)'}">₹${grandTotal.total.toLocaleString('en-IN')}</div>
    </div>
    ${userBudget > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${budgetPct}%;background:${budgetPct > 90 ? '#ef4444' : budgetPct > 75 ? '#f59e0b' : 'var(--jade)'}"></div></div>
    <div class="bud-meta" style="margin-bottom:10px"><span>${overBudget ? '⚠️ Over budget' : 'Within budget'}</span><span>₹${grandTotal.total} / ₹${userBudget}</span></div>` : ''}
    <div class="budget-day-scroll">
      ${days.map((d, i) => {
        const ct = Math.max(1, d.transport + d.food + d.entry);
        return `<div class="budget-day-card${i === dayIdx ? ' active' : ''}">
          <div class="budget-day-label">Day ${i + 1}</div>
          <div class="budget-day-amount">₹${d.total.toLocaleString('en-IN')}</div>
          <div class="budget-cat-bar">
            <div class="budget-cat-seg transport" style="width:${(d.transport / ct * 100).toFixed(0)}%"></div>
            <div class="budget-cat-seg food" style="width:${(d.food / ct * 100).toFixed(0)}%"></div>
            <div class="budget-cat-seg entry" style="width:${(d.entry / ct * 100).toFixed(0)}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="budget-cat-legend">
      <div class="budget-cat-item"><span class="budget-cat-dot" style="background:var(--ocean)"></span>Transport ₹${grandTotal.transport}</div>
      <div class="budget-cat-item"><span class="budget-cat-dot" style="background:var(--sand)"></span>Food ₹${grandTotal.food}</div>
      <div class="budget-cat-item"><span class="budget-cat-dot" style="background:var(--purple)"></span>Entry ₹${grandTotal.entry}</div>
    </div>`;
}
