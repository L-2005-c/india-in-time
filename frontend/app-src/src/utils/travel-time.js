/**
 * Traffic / crowd / smart travel-time pure helpers (extracted from core/app.js).
 * @param {function} hvKm - haversine km (from utils/geo.js)
 */

export function getTrafficMultiplier(congestionBase, minuteOfDay) {
  const base = congestionBase || 1.0;
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

export function getCrowdMultiplier(stop, dayOfWeek, minuteOfDay, month = new Date().getMonth()) {
  let mult = 1.0;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) mult += 0.2;
  if (month >= 9 || month <= 2) mult += 0.15;
  if (minuteOfDay >= 10 * 60 && minuteOfDay < 14 * 60) mult += 0.2;
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 18 * 60) mult += 0.15;
  if (minuteOfDay < 8 * 60 || minuteOfDay >= 20 * 60) mult -= 0.15;
  if (stop?.cat === 'scenic') mult += 0.1;
  if (stop?.cat === 'temple' && minuteOfDay >= 6 * 60 && minuteOfDay < 9 * 60) mult += 0.15;
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

export const ROAD_NETWORK_FACTOR = 1.42;

export function getSmartTravelTime(fromCoords, toCoords, congestionBase, arriveMin, isFirstStop, hvKm) {
  if (!fromCoords || !toCoords) return isFirstStop ? 10 : 20;
  const straightKm = hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const roadKm = straightKm * ROAD_NETWORK_FACTOR;
  // Realistic urban transit speed: ~19.2 km/h base driving speed before rush-hour multipliers
  const minMinutes = isFirstStop ? Math.max(2, Math.min(8, Math.round(roadKm * 2.5))) : Math.max(1, Math.min(4, Math.round(roadKm * 2.0)));
  const baseMinutes = Math.max(minMinutes, Math.min(90, Math.round(roadKm / 0.32)));
  const trafficMult = getTrafficMultiplier(congestionBase, arriveMin);
  return Math.max(1, Math.round(baseMinutes * trafficMult));
}

export function getSmartVisitTime(stop, arriveMin, dayOfWeek) {
  let mins = Number(stop?.duration || stop?.estMins || 60) || 60;
  const crowd = getCrowdMultiplier(stop, dayOfWeek, arriveMin);
  if (crowd >= 1.4) mins = Math.round(mins * 1.15);
  else if (crowd <= 0.85) mins = Math.round(mins * 0.9);
  return Math.max(20, Math.min(180, mins));
}
