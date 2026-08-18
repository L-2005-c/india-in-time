// scenicEngine.js

function solarPosition(lat, lon, date) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  // NOAA-style approximation sufficient for suitability scoring; never presented as a sensor observation.
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
  const gamma = 2 * Math.PI / 365 * (day - 1 + (date.getUTCHours() - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const minutesUTC = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarMin = (minutesUTC + eqTime + 4 * lon) % 1440;
  const hourAngle = (trueSolarMin / 4) < 0 ? trueSolarMin / 4 + 180 : trueSolarMin / 4 - 180;
  const ha = hourAngle * rad;
  const latRad = lat * rad;
  const zenith = Math.acos(
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(ha)
  );
  const elevation = 90 - zenith / rad;
  const azimuth = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad)) / rad + 180 + 360) % 360;
  return { elevation: Math.round(elevation * 10) / 10, azimuth: Math.round(azimuth * 10) / 10 };
}

const { isInGoldenHour, m2t } = require('./timeEngine');
function angularDifference(a, b) {
  const d = Math.abs(((Number(a) - Number(b) + 540) % 360) - 180);
  return d > 180 ? 360 - d : d;
}

function computeScenic(place = {}, ctx = {}) {
  const { nowMin = 720, sun = {}, golden = null, weatherIntel = null, now = new Date() } = ctx;
  const isSunriseSpot = !!place.is_sunrise_spot, isSunsetSpot = !!place.is_sunset_spot;
  const solar = solarPosition(place.coords?.[0], place.coords?.[1], now);
  const preferredAzimuth = Number(place.view_orientation_deg ?? place.viewAzimuth ?? place.orientationDeg);
  const orientationSupported = Number.isFinite(preferredAzimuth) && solar && Number.isFinite(solar.azimuth);
  const orientationDelta = orientationSupported ? angularDifference(preferredAzimuth, solar.azimuth) : null;
  const cat = place.cat || 'default';
  const isViewpoint = isSunriseSpot || isSunsetSpot || ['scenic', 'hill', 'beach', 'waterfall', 'fort', 'monument', 'park', 'garden'].includes(cat);
  let score = 40;
  const types = [], reasons = [];
  let bestWindow = null;
  if (isSunriseSpot && sun.sunriseMin != null) {
    types.push('sunrise');
    const windowStart = sun.sunriseMin - 20, windowEnd = sun.sunriseMin + 60;
    if (nowMin >= windowStart && nowMin <= windowEnd) { score += 35; reasons.push('Within sunrise viewing window'); bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunrise', startMin: windowStart, endMin: windowEnd }; }
    else { score += 10; reasons.push('Designated sunrise viewpoint'); if (!bestWindow) bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunrise', startMin: windowStart, endMin: windowEnd }; }
  }
  if (isSunsetSpot && sun.sunsetMin != null) {
    types.push('sunset');
    const windowStart = sun.sunsetMin - 60, windowEnd = sun.sunsetMin + 20;
    if (nowMin >= windowStart && nowMin <= windowEnd) { score += 35; reasons.push('Within sunset / golden-hour window'); bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunset', startMin: windowStart, endMin: windowEnd }; }
    else { score += 10; reasons.push('Designated sunset viewpoint'); if (!bestWindow) bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunset', startMin: windowStart, endMin: windowEnd }; }
  }
  const inGH = golden ? isInGoldenHour(nowMin, golden) : { morning: false, evening: false, any: false };
  if (inGH.any) { types.push('golden-hour'); if (!reasons.some((r) => r.includes('golden'))) { score += 15; reasons.push(inGH.morning ? 'Morning golden hour' : 'Evening golden hour'); } }
  if (['scenic', 'hill'].includes(cat)) { types.push('landscape'); score += 15; reasons.push('Scenic / landscape viewpoint'); }
  if (cat === 'beach') { types.push('beach'); score += 12; reasons.push('Beach views'); }
  if (cat === 'waterfall') { types.push('waterfall'); score += 12; reasons.push('Waterfall views'); }
  if (['fort', 'monument'].includes(cat)) { types.push('city'); score += 8; reasons.push('Historic / architectural views'); }
  if (place.has_nightlife && (nowMin >= 19 * 60 || nowMin < 5 * 60)) { types.push('night'); score += 10; reasons.push('Night views / illuminated atmosphere'); }
  if (orientationSupported && isViewpoint) {
    if (orientationDelta <= 20) { score += 18; reasons.push('View direction aligns closely with current solar azimuth'); }
    else if (orientationDelta <= 45) { score += 8; reasons.push('View direction is reasonably aligned with the sun'); }
    else if (orientationDelta >= 110) { score -= 10; reasons.push('View direction is poorly aligned with current solar azimuth'); }
  }
  if (weatherIntel) {
    if (weatherIntel.score >= 75) { score += 10; reasons.push('Good visibility / weather for views'); }
    else if (weatherIntel.score < 40) { score -= 20; reasons.push('Weather may reduce scenic quality'); }
  }
  if (!isViewpoint && types.length === 0) { score = 35; reasons.push('Not a primary scenic location'); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const suitability = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Limited';
  let photographyWindow = null;
  let photographyScore = Math.min(100, score);
  if (weatherIntel && isViewpoint) {
    if (weatherIntel.cloudCover != null) photographyScore += weatherIntel.cloudCover >= 20 && weatherIntel.cloudCover <= 55 ? 8 : weatherIntel.cloudCover > 85 ? -10 : 0;
    if (weatherIntel.visibilityKm != null) photographyScore += weatherIntel.visibilityKm >= 10 ? 8 : weatherIntel.visibilityKm >= 5 ? 3 : -8;
    photographyScore = Math.max(0, Math.min(100, Math.round(photographyScore)));
  }
  if (golden) {
    if (isSunriseSpot) photographyWindow = { start: golden.morningGolden.start, end: golden.morningGolden.end, label: 'Morning golden hour' };
    else if (isSunsetSpot) photographyWindow = { start: golden.eveningGolden.start, end: golden.eveningGolden.end, label: 'Evening golden hour' };
    else if (isViewpoint) photographyWindow = { start: golden.eveningGolden.start, end: golden.eveningGolden.end, label: 'Preferred evening light' };
  }
  return { solarPosition: solar, orientation: orientationSupported ? { targetAzimuth: preferredAzimuth, solarAzimuth: solar.azimuth, deltaDegrees: Math.round(orientationDelta * 10) / 10 } : null, scenicScore: score, photographyScore, suitability, scenicTypes: [...new Set(types)], bestScenicWindow: bestWindow, photographyWindow, reasons, isViewpoint, reason: reasons[0] || 'Standard location (limited scenic scoring)' };
}
module.exports = { computeScenic, solarPosition };
