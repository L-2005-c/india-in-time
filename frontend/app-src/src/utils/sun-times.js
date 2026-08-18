/**
 * Client-side sun / golden-hour math (extracted from core/app.js).
 */

export function getSunTimesClient(lat, lon, date = new Date()) {
  // NOAA-style approximation sufficient for UX scoring
  const rad = Math.PI / 180;
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((day - start) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const latRad = (lat || 20.6) * rad;
  const ha = Math.acos(Math.max(-1, Math.min(1,
    (Math.cos(90.833 * rad) / (Math.cos(latRad) * Math.cos(decl))) - Math.tan(latRad) * Math.tan(decl)
  )));
  const lngHour = (lon || 78.9) / 15;
  const sunriseUTC = 720 - 4 * (lngHour * 15 + ha / rad) - eqTime;
  const sunsetUTC = 720 - 4 * (lngHour * 15 - ha / rad) - eqTime;
  // IST = UTC+5:30 → +330 minutes
  const toLocalMin = (utcMin) => {
    let m = Math.round(utcMin + 330);
    while (m < 0) m += 1440;
    while (m >= 1440) m -= 1440;
    return m;
  };
  const sunriseMin = toLocalMin(sunriseUTC);
  const sunsetMin = toLocalMin(sunsetUTC);
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    sunriseMin,
    sunsetMin,
    sunrise: fmt(sunriseMin),
    sunset: fmt(sunsetMin),
    morningGolden: { startMin: sunriseMin - 15, endMin: sunriseMin + 60 },
    eveningGolden: { startMin: sunsetMin - 60, endMin: sunsetMin + 20 },
  };
}

export function placeSunTimes(loc, date = new Date()) {
  const coords = loc?.coords;
  const lat = Array.isArray(coords) ? coords[0] : 20.6;
  const lon = Array.isArray(coords) ? coords[1] : 78.9;
  return getSunTimesClient(lat, lon, date);
}
