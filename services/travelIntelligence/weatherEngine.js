function computeHeatIndex(tempC, relativeHumidity) {
  if (tempC == null || !Number.isFinite(tempC)) return null;
  const rh = Number.isFinite(relativeHumidity) ? Math.max(0, Math.min(100, relativeHumidity)) : 55;
  if (tempC < 27) return Math.round(tempC * 10) / 10;
  const T = tempC;
  const R = rh;
  const c1 = -8.78469475556;
  const c2 = 1.61139411;
  const c3 = 2.33854883889;
  const c4 = -0.14611605;
  const c5 = -0.012308094;
  const c6 = -0.0164248277778;
  const c7 = 0.002211732;
  const c8 = 0.00072546;
  const c9 = -0.000003582;
  const hi = c1 + c2 * T + c3 * R + c4 * T * R + c5 * T * T + c6 * R * R + c7 * T * T * R + c8 * T * R * R + c9 * T * T * R * R;
  return Math.round(Math.max(T, hi) * 10) / 10;
}

function computeApparentTemp(tempC, humidity, windKph) {
  if (tempC == null || !Number.isFinite(tempC)) return null;
  const hi = computeHeatIndex(tempC, humidity);
  if (tempC < 15 && windKph != null && windKph > 10) {
    const v = Math.pow(windKph, 0.16);
    const chill = 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
    return Math.round(chill * 10) / 10;
  }
  return hi;
}

// weatherEngine.js — BEAST mode micro-climate intelligence
function computeWeatherIntelligence(weather, place = {}, daypart = 'afternoon') {
  if (!weather || (weather.tempC == null && !weather.condition && weather.weathercode == null && weather.windKph == null && weather.rainMm == null)) {
    return { score: 50, suitability: 'Unknown', activityNotes: [], warnings: [], source: 'unavailable', confidence: 20, reason: 'No weather data available.', comfortBadge: '🌤️ Standard' };
  }
  let score = 70;
  const notes = [], warnings = [];
  const isOutdoor = place.indoor_outdoor === 'outdoor' || ['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument', 'viewpoint'].includes(place.cat);
  const temp = weather.tempC;
  const humidity = weather.humidity ?? (weather.rh ?? 55);
  const wind = weather.windKph;
  const apparentTemp = computeApparentTemp(temp, humidity, wind);

  let comfortBadge = '☀️ Pleasant Weather';
  let indoorRecommended = false;

  if (temp != null) {
    if (temp >= 15 && temp <= 28) { score += 15; notes.push('Comfortable temperature'); comfortBadge = '🌤️ Ideal Weather'; }
    else if (temp >= 10 && temp < 15) { score += 5; notes.push('Cool — pleasant for outdoor walks'); comfortBadge = '🍃 Crisp & Cool'; }
    else if (temp > 28 && temp <= 33) { score -= 5; notes.push('Warm'); comfortBadge = '☀️ Warm Day'; }
    else if (temp > 33 && temp < 38) {
      score -= 15;
      if (isOutdoor) { warnings.push('Hot outdoor conditions — plan shorter outdoor stops'); notes.push('Prefer morning/evening outdoor windows'); comfortBadge = '🌡️ Warm Afternoon'; }
      else { notes.push('Good indoor escape from heat'); score += 8; comfortBadge = '🏛️ Cool Indoor Escape'; }
    } else if (temp >= 38) {
      score -= 30; warnings.push('Extreme heat — avoid prolonged outdoor activity');
      indoorRecommended = true;
      if (!isOutdoor) { score += 15; notes.push('Indoor venue recommended during extreme heat'); comfortBadge = '🏛️ AC Indoor Venue'; }
      else { comfortBadge = '🔥 High Heat Advisory'; }
    } else if (temp < 10) { score -= 10; notes.push('Cold conditions'); comfortBadge = '❄️ Chilly Weather'; }
  }
  const cond = (weather.condition || '').toLowerCase();
  const code = weather.weathercode;
  const isRain = /rain|storm|drizzle|shower|thunder/i.test(cond) || (code != null && code >= 51);
  const isHeavyRain = /heavy|storm|thunder/i.test(cond) || (code != null && code >= 80);
  if (isHeavyRain) {
    score -= 35; warnings.push('Heavy rain risk — outdoor activities not recommended');
    indoorRecommended = true;
    if (!isOutdoor) { score += 12; notes.push('Indoor venue suitable during rain'); comfortBadge = '🏛️ Covered Venue'; }
    else { comfortBadge = '⛈️ Heavy Rain Alert'; }
  } else if (isRain) {
    score -= 20; warnings.push('Rain expected — carry protection; outdoor visits may be uncomfortable');
    if (!isOutdoor) { score += 8; comfortBadge = '☕ Indoor / Cafe'; }
    else { comfortBadge = '🌧️ Rain Alert'; }
  } else if (/clear|sunny|fair/i.test(cond) || (code != null && code <= 1)) {
    score += 12; notes.push('Clear / sunny conditions');
    if (daypart === 'evening' || daypart === 'sunset') comfortBadge = '🌅 Golden Hour Clear';
  } else if (/cloud|overcast|partly/i.test(cond) || (code != null && code <= 3)) {
    score += 5; notes.push('Partly cloudy — good visibility for views');
    if (daypart === 'afternoon' && temp > 30) comfortBadge = '⛅ Sun-Shielded Views';
  }
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
  return {
    score,
    suitability,
    activityNotes: notes,
    warnings,
    source: weather.forecast ? 'forecast' : 'observed',
    confidence: weather.tempC != null ? 75 : 50,
    reason: warnings.length ? warnings[0] : notes[0] || `${suitability} weather for this place type`,
    tempC: temp,
    apparentTempC: apparentTemp,
    condition: weather.condition || null,
    windKph: wind,
    comfortBadge,
    indoorRecommended,
  };
}

function buildWeatherExperienceWindows(weather, place = {}) {
  const hourly = Array.isArray(weather?.hourly) ? weather.hourly : [];
  if (!hourly.length) {
    return { source: 'unavailable', windows: [], reason: 'No hourly forecast data supplied.' };
  }
  const windows = hourly.map((h) => {
    const score = computeWeatherIntelligence(h, place, h.daypart || 'afternoon');
    return {
      start: h.time || h.timestamp || null,
      score: score.score,
      suitability: score.suitability,
      warnings: score.warnings,
      source: 'forecast',
      confidence: score.confidence,
    };
  }).filter((w) => w.start);
  return {
    source: 'forecast',
    windows,
    best: windows.slice().sort((a, b) => b.score - a.score)[0] || null,
  };
}

function weatherEmoji(code) {
  if (code <= 1)  return '☀️';
  if (code <= 3)  return '⛅';
  if (code <= 48) return '☁️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  return '⛈️';
}

function weatherDesc(code) {
  if (code <= 1)  return 'Clear skies';
  if (code <= 3)  return 'Partly cloudy';
  if (code <= 48) return 'Overcast / foggy';
  if (code <= 67) return 'Rain expected';
  if (code <= 77) return 'Snow / sleet';
  return 'Thunderstorm';
}

function getDeterministicWeather(lat, lon, now = new Date()) {
  const month = now.getMonth();
  const hour = now.getHours();
  const latitude = Number(lat) || 20;

  let baseTemp = 28;
  const isMonsoon = month >= 5 && month <= 8; // Jun-Sep
  const isWinter = month >= 11 || month <= 1;  // Dec-Feb
  const isSummer = month >= 2 && month <= 4;   // Mar-May

  if (latitude > 28) {
    if (isWinter) baseTemp = 16;
    else if (isSummer) baseTemp = 38;
    else if (isMonsoon) baseTemp = 32;
    else baseTemp = 28;
  } else if (latitude > 20) {
    if (isWinter) baseTemp = 24;
    else if (isSummer) baseTemp = 35;
    else if (isMonsoon) baseTemp = 29;
    else baseTemp = 30;
  } else {
    if (isWinter) baseTemp = 26;
    else if (isSummer) baseTemp = 33;
    else if (isMonsoon) baseTemp = 28;
    else baseTemp = 29;
  }

  const hourDelta = Math.sin(((hour - 8) / 24) * 2 * Math.PI) * 4;
  const temp = Math.round(baseTemp + hourDelta);

  let weathercode = 1;
  if (isMonsoon) {
    weathercode = (hour >= 14 && hour <= 19) ? 51 : 2;
  } else if (isWinter && (hour <= 8 || hour >= 22)) {
    weathercode = 45;
  } else {
    weathercode = 1;
  }

  const windKph = isMonsoon ? 18 : 12;
  const hourly = [];
  for (let i = 0; i < 24; i++) {
    const hTime = new Date(now);
    hTime.setHours(i, 0, 0, 0);
    const hDelta = Math.sin(((i - 8) / 24) * 2 * Math.PI) * 4;
    const hTemp = Math.round(baseTemp + hDelta);
    hourly.push({
      time: hTime.toISOString().slice(0, 16),
      tempC: hTemp,
      precipitationProbability: isMonsoon ? (i >= 13 && i <= 19 ? 65 : 30) : 5,
      precipitationMm: isMonsoon ? 2 : 0,
      humidity: isMonsoon ? 80 : 55,
      windKph: isMonsoon ? 18 : 12,
      uvIndex: (i >= 10 && i <= 16) ? 7 : 0,
      cloudCover: isMonsoon ? 75 : 20,
      visibilityM: 10000,
      weathercode: isMonsoon ? 51 : 1,
    });
  }

  return {
    temp,
    tempC: temp,
    windKph,
    weathercode,
    emoji: weatherEmoji(weathercode),
    display: `${weatherEmoji(weathercode)} ${temp}°C`,
    forecastSource: 'seasonal_estimate',
    hourly,
  };
}

module.exports = {
  computeWeatherIntelligence,
  computeHeatIndex,
  computeApparentTemp,
  buildWeatherExperienceWindows,
  getDeterministicWeather,
  weatherEmoji,
  weatherDesc,
};
