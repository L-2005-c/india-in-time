// weatherEngine.js — no invention of weather data
function computeWeatherIntelligence(weather, place = {}, daypart = 'afternoon') {
  if (!weather || (weather.tempC == null && !weather.condition && weather.weathercode == null && weather.windKph == null && weather.rainMm == null)) {
    return { score: 50, suitability: 'Unknown', activityNotes: [], warnings: [], source: 'unavailable', confidence: 20, reason: 'No weather data available.' };
  }
  let score = 70;
  const notes = [], warnings = [];
  const isOutdoor = place.indoor_outdoor === 'outdoor' || ['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument'].includes(place.cat);
  const temp = weather.tempC;
  if (temp != null) {
    if (temp >= 15 && temp <= 28) { score += 15; notes.push('Comfortable temperature'); }
    else if (temp >= 10 && temp < 15) { score += 5; notes.push('Cool — pleasant for outdoor walks'); }
    else if (temp > 28 && temp <= 33) { score -= 5; notes.push('Warm'); }
    else if (temp > 33 && temp < 38) {
      score -= 15;
      if (isOutdoor) { warnings.push('Hot outdoor conditions — plan shorter outdoor stops'); notes.push('Prefer morning/evening outdoor windows'); }
      else { notes.push('Good indoor escape from heat'); score += 8; }
    } else if (temp >= 38) {
      score -= 30; warnings.push('Extreme heat — avoid prolonged outdoor activity');
      if (!isOutdoor) { score += 15; notes.push('Indoor venue recommended during extreme heat'); }
    } else if (temp < 10) { score -= 10; notes.push('Cold conditions'); }
  }
  const cond = (weather.condition || '').toLowerCase();
  const code = weather.weathercode;
  const isRain = /rain|storm|drizzle|shower|thunder/i.test(cond) || (code != null && code >= 51);
  const isHeavyRain = /heavy|storm|thunder/i.test(cond) || (code != null && code >= 80);
  if (isHeavyRain) { score -= 35; warnings.push('Heavy rain risk — outdoor activities not recommended'); if (!isOutdoor) { score += 12; notes.push('Indoor venue suitable during rain'); } }
  else if (isRain) { score -= 20; warnings.push('Rain expected — carry protection; outdoor visits may be uncomfortable'); if (!isOutdoor) score += 8; }
  else if (/clear|sunny|fair/i.test(cond) || (code != null && code <= 1)) { score += 12; notes.push('Clear / sunny conditions'); }
  else if (/cloud|overcast|partly/i.test(cond) || (code != null && code <= 3)) { score += 5; notes.push('Partly cloudy — good visibility for views'); }
  const wind = weather.windKph;
  if (wind != null) {
    if (wind >= 30) {
      score -= wind >= 40 ? 20 : 10;
      if (place.cat === 'beach' || place.is_sunset_spot || place.cat === 'scenic') warnings.push('Strong winds — use caution at open viewpoints/beaches');
    } else if (wind < 15) score += 3;
  }
  if (weather.uv != null && weather.uv >= 8 && isOutdoor && daypart !== 'night') { warnings.push('High UV — sun protection advised'); score -= 5; }
  if (weather.cloudCover != null && (place.is_sunrise_spot || place.is_sunset_spot || place.cat === 'scenic')) {
    if (weather.cloudCover < 40) { score += 8; notes.push('Low cloud cover — favourable for photography / views'); }
    else if (weather.cloudCover > 80) { score -= 8; notes.push('Heavy cloud cover may reduce scenic visibility'); }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  let suitability = 'Fair';
  if (score >= 85) suitability = 'Excellent';
  else if (score >= 70) suitability = 'Good';
  else if (score >= 50) suitability = 'Fair';
  else if (score >= 30) suitability = 'Poor';
  else suitability = 'Very Poor';
  if (isOutdoor && score >= 75) notes.push('Excellent for outdoor activity');
  if (isOutdoor && score < 40) notes.push('Poor for outdoor activity');
  if ((place.is_sunrise_spot || place.is_sunset_spot) && score >= 70) notes.push('Favourable for photography');
  return { score, suitability, activityNotes: notes, warnings, source: weather.forecast ? 'forecast' : 'observed', confidence: weather.tempC != null ? 75 : 50, reason: warnings.length ? warnings[0] : notes[0] || `${suitability} weather for this place type`, tempC: temp, condition: weather.condition || null, windKph: wind };
}
module.exports = { computeWeatherIntelligence };
