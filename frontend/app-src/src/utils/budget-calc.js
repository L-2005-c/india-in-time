// Pure trip-cost estimation math (per-stop / per-day / whole-trip).
import { ENTRY_FEE_ESTIMATES, getTransportConfig } from '../data/cities.js';
import { hvKm } from './geo.js';

function calculateStopBudget(stop, prevCoords, cityId){
  const config = getTransportConfig(cityId);
  const km = prevCoords && stop?.coords ? hvKm(prevCoords[0], prevCoords[1], stop.coords[0], stop.coords[1]) : 0;
  const transport = Math.round(config.autoBase + config.autoPerKm * km);
  const entry = ENTRY_FEE_ESTIMATES[stop?.cat] || 0;
  const food = stop?.cat === 'food' ? 300 : 0;
  return { transport, entry, food, misc:0, total:transport+entry+food };
}

function calculateDayBudget(dayStops, cityId, startCoords){
  let totals = { transport:0, entry:0, food:0, misc:0, total:0 };
  let prevCoords = startCoords;
  for(const stop of (dayStops||[])){
    if(stop.isBreak){ prevCoords = stop.coords; continue; }
    const b = calculateStopBudget(stop, prevCoords, cityId);
    totals.transport += b.transport;
    totals.entry += b.entry;
    totals.food += b.food;
    totals.total += b.total;
    prevCoords = stop.coords;
  }
  return totals;
}

function calculateTripBudget(plan, cityId, startCoords){
  const days = [];
  let grandTotal = { transport:0, entry:0, food:0, misc:0, total:0 };
  for(const dayStops of (plan||[])){
    const db = calculateDayBudget(dayStops, cityId, startCoords);
    days.push(db);
    grandTotal.transport += db.transport;
    grandTotal.entry += db.entry;
    grandTotal.food += db.food;
    grandTotal.total += db.total;
  }
  return { days, grandTotal };
}

export {
  calculateStopBudget, calculateDayBudget, calculateTripBudget,
};
