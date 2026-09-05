/**
 * Time Intelligence badge HTML builder (extracted from core/app.js).
 * Pass pure helpers + weather snapshot via ctx to avoid DOM coupling.
 */
export function getTimeBadgesHtml(loc, evalTime, ctx = {}) {
  const {
    getPlaceDynamicStatus,
    getCrowdPrediction,
    calculateExperienceScore,
    placeSunTimes,
    realTemp,
    realWeatherMain,
    realWind = 0,
    nowMin,
  } = ctx;
  const status = getPlaceDynamicStatus(loc, evalTime);
  const crowd = getCrowdPrediction(loc, evalTime);
  const now = evalTime !== undefined ? evalTime : nowMin;
  const scoreInfo = calculateExperienceScore(loc, now);

  let html = `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${status.color}; color:#fff; display:inline-block; margin-top:4px; margin-right:4px;">${status.label}</span>`;

  if (crowd === 'High' || crowd === 'Very High') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,100,100,0.2); display:inline-block; margin-top:4px; margin-right:4px;">👥 Peak Crowd</span>`;
  }

  const { sunriseMin, sunsetMin } = placeSunTimes(loc);
  if (loc.is_sunrise_spot && now >= sunriseMin - 30 && now <= sunriseMin + 90) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,200,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌅 Best at Sunrise</span>`;
  }
  if (loc.is_sunset_spot && now >= sunsetMin - 90 && now <= sunsetMin + 30) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,100,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌇 Best at Sunset</span>`;
  }

  if (realTemp && realTemp > 35 && loc.indoor_outdoor === 'outdoor') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,0,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🔥 Hot Weather</span>`;
  }
  if (realWeatherMain && /rain|storm|drizzle/i.test(realWeatherMain) && loc.indoor_outdoor !== 'indoor') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(0,100,255,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌧 Rain Alert</span>`;
  }
  if (realWind >= 30 && (loc.cat === 'beach' || loc.cat === 'scenic' || loc.is_sunset_spot)) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(120,180,255,0.2); display:inline-block; margin-top:4px; margin-right:4px;">💨 Strong Wind</span>`;
  }
  if (status.status === 'open' && scoreInfo.score >= 80) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(168,85,247,0.25); display:inline-block; margin-top:4px; margin-right:4px;">✨ Best Time Now</span>`;
  }

  // Cloud Inversion Window (Vanjangi / Lambasingi 05:00 - 07:30)
  if (/vanjangi|lambasingi|dallapalli/i.test(loc.name || '') && now >= 300 && now <= 450) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(99,102,241,0.25); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); display:inline-block; margin-top:4px; margin-right:4px;">☁️ Cloud Inversion Window</span>`;
  }

  // Temple Midday Sanctum Closure Warning (12:30 - 15:30)
  if ((loc.cat === 'temple' || /temple|mandir|kovil/i.test(loc.name || '')) && now >= 750 && now <= 930) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.35); display:inline-block; margin-top:4px; margin-right:4px;">⚠️ Midday Sanctum Closure (12:30–15:30)</span>`;
  }

  // Tirumala Ghat Road Curfew (23:45 - 03:00)
  if (/tirumala|srivari|venkateswara/i.test(loc.name || '') && (now >= 23 * 60 + 45 || now < 3 * 60)) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(220,38,38,0.25); color:#f87171; border:1px solid rgba(220,38,38,0.5); display:inline-block; margin-top:4px; margin-right:4px;">⛔ Tirumala Ghat Road Curfew</span>`;
  }

  // Highland Mountain Ghat Road corridor
  if (/paderu|araku|katiki|vanjangi|lambasingi|borra/i.test(loc.name || '') || (loc.coords && loc.coords[0] >= 17.75 && loc.coords[0] <= 18.45 && loc.coords[1] >= 82.40 && loc.coords[1] <= 83.15)) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(234,179,8,0.15); color:#fde047; border:1px solid rgba(234,179,8,0.3); display:inline-block; margin-top:4px; margin-right:4px;">⛰️ Ghat Corridor</span>`;
  }

  const ti = loc._ti;
  if (ti && ti.visitScore != null) {
    const band = ti.visitLabel || '';
    const color = ti.visitScore >= 75 ? 'rgba(34,197,94,0.25)' : ti.visitScore >= 50 ? 'rgba(234,179,8,0.25)' : 'rgba(239,68,68,0.2)';
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${color}; display:inline-block; margin-top:4px; margin-right:4px;">⭐ ${ti.visitScore}/100 ${band}</span>`;
    if (ti.confidence && ti.confidence.level) {
      html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(100,100,255,0.15); display:inline-block; margin-top:4px; margin-right:4px;">Confidence ${ti.confidence.level}</span>`;
    }
  }

  return html;
}
