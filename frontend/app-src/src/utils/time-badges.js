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
