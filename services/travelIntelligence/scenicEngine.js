// scenicEngine.js
const { isInGoldenHour, m2t } = require('./timeEngine');
function computeScenic(place = {}, ctx = {}) {
  const { nowMin = 720, sun = {}, golden = null, weatherIntel = null } = ctx;
  const isSunriseSpot = !!place.is_sunrise_spot, isSunsetSpot = !!place.is_sunset_spot;
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
  if (weatherIntel) {
    if (weatherIntel.score >= 75) { score += 10; reasons.push('Good visibility / weather for views'); }
    else if (weatherIntel.score < 40) { score -= 20; reasons.push('Weather may reduce scenic quality'); }
  }
  if (!isViewpoint && types.length === 0) { score = 35; reasons.push('Not a primary scenic location'); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const suitability = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Limited';
  let photographyWindow = null;
  if (golden) {
    if (isSunriseSpot) photographyWindow = { start: golden.morningGolden.start, end: golden.morningGolden.end, label: 'Morning golden hour' };
    else if (isSunsetSpot) photographyWindow = { start: golden.eveningGolden.start, end: golden.eveningGolden.end, label: 'Evening golden hour' };
    else if (isViewpoint) photographyWindow = { start: golden.eveningGolden.start, end: golden.eveningGolden.end, label: 'Preferred evening light' };
  }
  return { scenicScore: score, suitability, scenicTypes: [...new Set(types)], bestScenicWindow: bestWindow, photographyWindow, reasons, isViewpoint, reason: reasons[0] || 'Standard location (limited scenic scoring)' };
}
module.exports = { computeScenic };
