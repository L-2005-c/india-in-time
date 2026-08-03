import { getTransportConfig, ENTRY_FEE_ESTIMATES } from '../data/transportConfig.js';
import { hvKm } from '../core/utils.js';
import { state } from '../core/state.js';

export function getTrafficMultiplier(cityId, minuteOfDay) {
  const config = getTransportConfig(cityId, state.currentCityId);
  const base = config.congestion || 1.0;
  if (minuteOfDay >= 8 * 60 && minuteOfDay < 10 * 60) return base * 1.5;
  if (minuteOfDay >= 10 * 60 && minuteOfDay < 12 * 60) return base * 1.15;
  if (minuteOfDay >= 12 * 60 && minuteOfDay < 14 * 60) return base * 1.1;
  if (minuteOfDay >= 14 * 60 && minuteOfDay < 17 * 60) return base * 1.05;
  if (minuteOfDay >= 17 * 60 && minuteOfDay < 20 * 60) return base * 1.6;
  if (minuteOfDay >= 20 * 60 && minuteOfDay < 22 * 60) return base * 0.9;
  if (minuteOfDay >= 22 * 60 || minuteOfDay < 6 * 60) return base * 0.7;
  return base * 1.0;
}

export function getTrafficLevel(multiplier) {
  if (multiplier <= 1.05) return { level: 'light', label: 'Light Traffic', emoji: '🟢' };
  if (multiplier <= 1.35) return { level: 'moderate', label: 'Moderate Traffic', emoji: '🟡' };
  return { level: 'heavy', label: 'Heavy Traffic', emoji: '🔴' };
}

export function getCrowdMultiplier(stop, dayOfWeek, minuteOfDay) {
  let mult = 1.0;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) mult += 0.2;
  const month = new Date().getMonth();
  if (month >= 9 || month <= 2) mult += 0.15;
  if (minuteOfDay >= 10 * 60 && minuteOfDay < 14 * 60) mult += 0.2;
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 18 * 60) mult += 0.15;
  if (minuteOfDay < 8 * 60 || minuteOfDay >= 20 * 60) mult -= 0.15;
  if (stop?.cat === 'scenic') mult += 0.1;
  if (stop?.cat === 'temple' && (minuteOfDay >= 6 * 60 && minuteOfDay < 9 * 60)) mult += 0.15;
  if (stop?.cat === 'beach' && isWeekend) mult += 0.2;
  if (stop?.importance === 'must_see') mult += 0.15;
  return Math.max(0.7, Math.min(2.0, mult));
}

export function getCrowdLevel(multiplier) {
  if (multiplier <= 0.9) return { level: 'low', label: 'Low Crowd', emoji: '🟢' };
  if (multiplier <= 1.2) return { level: 'medium', label: 'Medium Crowd', emoji: '🟡' };
  if (multiplier <= 1.5) return { level: 'high', label: 'High Crowd', emoji: '🟠' };
  return { level: 'extreme', label: 'Very Crowded', emoji: '🔴' };
}

export function getTransportOptions(fromCoords, toCoords, cityId, arriveMin) {
  const config = getTransportConfig(cityId, state.currentCityId);
  const km = fromCoords && toCoords ? hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) : 3;
  const trafficMult = getTrafficMultiplier(cityId, arriveMin);
  const options = [];
  
  if (km <= 2.0) {
    options.push({
      mode: 'walk', icon: '🚶', label: 'Walk', fare: 0, fareStr: 'Free', time: Math.round(km * 14),
      link: toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=walking` : '#'
    });
  }
  options.push({
    mode: 'bus', icon: '🚌', label: 'Bus',
    fare: Math.round(config.busFare[0] + (config.busFare[1] - config.busFare[0]) * Math.min(1, km / 10)),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.round((km / 0.3) * trafficMult),
    link: toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#'
  });
  
  if (config.hasMetro) {
    const mf = config.metroFare || [10, 60];
    let modeLabel = 'Metro';
    let lastMileFare = 0;
    let lastMileTime = 0;
    if (km > 3.5) {
      const lastMileKm = Math.min(3, km * 0.2);
      if (lastMileKm > 1.2) {
        lastMileFare = Math.round(config.autoBase + (lastMileKm * config.autoPerKm));
        lastMileTime = Math.round((lastMileKm / 0.4) * trafficMult);
        modeLabel = 'Metro+Auto';
      } else {
        lastMileTime = Math.round(lastMileKm * 14);
        modeLabel = 'Metro+Walk';
      }
    }
    options.push({
      mode: 'metro', icon: '🚇', label: modeLabel,
      fare: Math.round(mf[0] + (mf[1] - mf[0]) * Math.min(1, km / 15)) + lastMileFare,
      get fareStr() { return `₹${this.fare}`; },
      time: Math.round(km / 0.55 + 8) + lastMileTime,
      link: toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#'
    });
  }
  
  if (config.hasTrain && km > 3) {
    const tf = config.trainFare || [10, 30];
    let modeLabel = 'Train';
    let lastMileFare = 0;
    let lastMileTime = 0;
    if (km > 5.0) {
      const lastMileKm = Math.min(4, km * 0.25);
      if (lastMileKm > 1.2) {
        lastMileFare = Math.round(config.autoBase + (lastMileKm * config.autoPerKm));
        lastMileTime = Math.round((lastMileKm / 0.4) * trafficMult);
        modeLabel = 'Train+Auto';
      } else {
        lastMileTime = Math.round(lastMileKm * 14);
        modeLabel = 'Train+Walk';
      }
    }
    options.push({
      mode: 'train', icon: '🚂', label: modeLabel,
      fare: Math.round(tf[0] + (tf[1] - tf[0]) * Math.min(1, km / 20)) + lastMileFare,
      get fareStr() { return `₹${this.fare}`; },
      time: Math.round(km / 0.5 + 12) + lastMileTime,
      link: toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#'
    });
  }
  
  options.push({
    mode: 'auto', icon: '🛺', label: 'Auto',
    fare: Math.round(config.autoBase + config.autoPerKm * km),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.round((km / 0.4) * trafficMult),
    link: toCoords ? `https://book.olacabs.com/?drop_lat=${toCoords[0]}&drop_lng=${toCoords[1]}` : '#'
  });
  
  options.push({
    mode: 'cab', icon: '🚕', label: 'Cab',
    fare: Math.round(config.cabBase + config.cabPerKm * km),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.round((km / 0.45) * trafficMult),
    link: toCoords ? `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${toCoords[0]}&dropoff[longitude]=${toCoords[1]}` : '#'
  });
  
  const cheapest = options.reduce((a, b) => a.fare <= b.fare ? a : b);
  const fastest = options.reduce((a, b) => a.time <= b.time ? a : b);
  cheapest.isCheapest = true;
  if (fastest.mode !== cheapest.mode) fastest.isFastest = true;
  
  return { options, km, trafficMult };
}

export function calculateStopBudget(stop, prevCoords, cityId) {
  const config = getTransportConfig(cityId, state.currentCityId);
  const km = prevCoords && stop?.coords ? hvKm(prevCoords[0], prevCoords[1], stop.coords[0], stop.coords[1]) : 0;
  const transport = Math.round(config.autoBase + config.autoPerKm * km);
  const entry = ENTRY_FEE_ESTIMATES[stop?.cat] || 0;
  const food = stop?.cat === 'food' ? 300 : 0;
  return { transport, entry, food, misc: 0, total: transport + entry + food };
}

export function calculateDayBudget(dayStops, cityId, startCoords) {
  let totals = { transport: 0, entry: 0, food: 0, misc: 0, total: 0 };
  let prevCoords = startCoords;
  for (const stop of (dayStops || [])) {
    if (stop.isBreak) { prevCoords = stop.coords; continue; }
    const b = calculateStopBudget(stop, prevCoords, cityId);
    totals.transport += b.transport;
    totals.entry += b.entry;
    totals.food += b.food;
    totals.total += b.total;
    prevCoords = stop.coords;
  }
  return totals;
}

export function calculateTripBudget(plan, cityId, startCoords) {
  const days = [];
  let grandTotal = { transport: 0, entry: 0, food: 0, misc: 0, total: 0 };
  for (const dayStops of (plan || [])) {
    const db = calculateDayBudget(dayStops, cityId, startCoords);
    days.push(db);
    grandTotal.transport += db.transport;
    grandTotal.entry += db.entry;
    grandTotal.food += db.food;
    grandTotal.total += db.total;
  }
  return { days, grandTotal };
}

export function renderBudgetBreakdown() {
  const el = document.getElementById('budget-breakdown');
  if (!el || !state.tripBudgetData) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'block';
  const { days, grandTotal } = state.tripBudgetData;
  const userBudget = parseFloat(document.getElementById('trip-budget-input')?.value) || 0;
  const overBudget = userBudget > 0 && grandTotal.total > userBudget;
  const budgetPct = userBudget > 0 ? Math.min(100, (grandTotal.total / userBudget) * 100) : 0;
  const catTotal = Math.max(1, grandTotal.transport + grandTotal.food + grandTotal.entry);
  
  el.innerHTML = `
    <div class="budget-opt-header">
      <div class="budget-opt-title">💰 Estimated Trip Budget</div>
      <div class="budget-opt-total" style="color:${overBudget ? '#f87171' : 'var(--jade)'}">₹${grandTotal.total.toLocaleString('en-IN')}</div>
    </div>
    ${userBudget > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${budgetPct}%;background:${budgetPct > 90 ? '#ef4444' : budgetPct > 75 ? '#f59e0b' : 'var(--jade)'}"></div></div>
    <div class="bud-meta" style="margin-bottom:10px"><span>${overBudget ? '⚠️ Over budget' : 'Within budget'}</span><span>₹${grandTotal.total} / ₹${userBudget}</span></div>` : ''}
    <div class="budget-day-scroll">
      ${days.map((d, i) => {
        const ct = Math.max(1, d.transport + d.food + d.entry);
        return `<div class="budget-day-card${i === state.dayIdx ? ' active' : ''}">
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
