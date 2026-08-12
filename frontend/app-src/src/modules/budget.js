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
  let total = 0;
  for (const stop of dayStops || []) {
    const b = calculateStopBudget(stop, prev, cityId, helpers);
    items.push({ stop, ...b });
    total += b.total;
    if (stop.coords) prev = stop.coords;
  }
  return { items, total };
}

export function calculateTripBudget(plan, cityId, startCoords, helpers = {}) {
  const days = (plan || []).map((day, i) =>
    calculateDayBudget(Array.isArray(day) ? day : [day], cityId, i === 0 ? startCoords : null, helpers)
  );
  return {
    days,
    total: days.reduce((s, d) => s + d.total, 0),
  };
}

export function formatInr(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}
