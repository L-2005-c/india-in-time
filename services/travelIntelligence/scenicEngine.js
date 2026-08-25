'use strict';

/**
 * services/travelIntelligence/scenicEngine.js
 * Scenic Intelligence 2.0 — Photometric & Atmospheric Landscape Experience Engine.
 *
 * Implements:
 * 1. NOAA-style solar position calculation (elevation & azimuth).
 * 2. Category-specific scenic models (Beach, Viewpoint, Waterfall, Temple/Monument, City Skyline).
 * 3. Exact Peak Scenic Moment & Best Scenic Window calculation.
 * 4. Multi-factor Scenic Experience Score (0-100) with explicit sub-component scores.
 * 5. Data confidence evaluation.
 */

const { isInGoldenHour, m2t } = require('./timeEngine');

function solarPosition(lat, lon, date) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
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

function angularDifference(a, b) {
  const d = Math.abs(((Number(a) - Number(b) + 540) % 360) - 180);
  return d > 180 ? 360 - d : d;
}

/**
 * Computes category-specific scenic experience score and peak window.
 */
function computeScenic(place = {}, ctx = {}) {
  const { nowMin = 720, sun = {}, golden = null, weatherIntel = null, now = new Date() } = ctx;
  const isSunriseSpot = !!place.is_sunrise_spot;
  const isSunsetSpot = !!place.is_sunset_spot;
  const coords = place.coords || [17.6868, 83.2185];
  const solar = solarPosition(coords[0], coords[1], now);
  const preferredAzimuth = Number(place.view_orientation_deg ?? place.viewAzimuth ?? place.orientationDeg);
  const orientationSupported = Number.isFinite(preferredAzimuth) && solar && Number.isFinite(solar.azimuth);
  const orientationDelta = orientationSupported ? angularDifference(preferredAzimuth, solar.azimuth) : null;
  const cat = String(place.cat || place.category || 'default').toLowerCase();
  const isViewpoint = isSunriseSpot || isSunsetSpot || ['scenic', 'hill', 'beach', 'waterfall', 'fort', 'monument', 'park', 'garden'].includes(cat);

  let score = 40;
  const types = [];
  const reasons = [];
  let bestWindow = null;
  let peakMoment = null;

  // 1. Solar & Time Window Matching
  if (isSunriseSpot && sun.sunriseMin != null) {
    types.push('sunrise');
    const windowStart = sun.sunriseMin - 20;
    const windowEnd = sun.sunriseMin + 60;
    const peakMin = sun.sunriseMin + 10;
    if (nowMin >= windowStart && nowMin <= windowEnd) {
      score += 38;
      reasons.push('Within sunrise golden-hour window');
    } else {
      score += 10;
      reasons.push('Designated sunrise viewpoint');
    }
    bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunrise', startMin: windowStart, endMin: windowEnd };
    peakMoment = m2t(peakMin);
  }

  if (isSunsetSpot && sun.sunsetMin != null) {
    types.push('sunset');
    const windowStart = sun.sunsetMin - 60;
    const windowEnd = sun.sunsetMin + 25;
    const peakMin = sun.sunsetMin - 15;
    if (nowMin >= windowStart && nowMin <= windowEnd) {
      score += 38;
      reasons.push('Within sunset golden-hour window');
    } else {
      score += 10;
      reasons.push('Designated sunset viewpoint');
    }
    if (!bestWindow) {
      bestWindow = { start: m2t(windowStart), end: m2t(windowEnd), type: 'sunset', startMin: windowStart, endMin: windowEnd };
      peakMoment = m2t(peakMin);
    }
  }

  const inGH = golden ? isInGoldenHour(nowMin, golden) : { morning: false, evening: false, any: false };
  if (inGH.any) {
    types.push('golden-hour');
    if (!reasons.some(r => r.includes('golden'))) {
      score += 16;
      reasons.push(inGH.morning ? 'Morning golden hour illumination' : 'Evening golden hour illumination');
    }
  }

  // 2. Category-Specific Experience Logic
  if (cat === 'beach') {
    types.push('beach');
    score += 14;
    reasons.push('Expansive ocean vista & horizon lighting');
  } else if (cat === 'waterfall') {
    types.push('waterfall');
    score += 15;
    reasons.push('Lush cascade scenery');
  } else if (['scenic', 'hill'].includes(cat)) {
    types.push('landscape');
    score += 16;
    reasons.push('Panoramic landscape elevation');
  } else if (['fort', 'monument'].includes(cat)) {
    types.push('monument');
    score += 10;
    reasons.push('Architectural heritage vista');
  }

  // 3. Viewpoint Solar Alignment
  if (orientationSupported && isViewpoint) {
    if (orientationDelta <= 25) {
      score += 18;
      reasons.push('View direction aligns closely with solar lighting angle');
    } else if (orientationDelta <= 55) {
      score += 8;
      reasons.push('View direction is well-positioned for ambient light');
    } else if (orientationDelta >= 115) {
      score -= 10;
      reasons.push('View direction is back-lit with harsh contrast');
    }
  }

  // 4. Weather & Visibility Modifiers
  if (weatherIntel) {
    if (weatherIntel.score >= 75) {
      score += 10;
      reasons.push('Clear atmospheric visibility');
    } else if (weatherIntel.score < 40) {
      score -= 22;
      reasons.push('Precipitation/overcast reduces visual clarity');
    }
  }

  if (!isViewpoint && types.length === 0) {
    score = 35;
    reasons.push('Standard indoor / commercial destination');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const suitability = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Limited';

  // Sub-component score breakdown
  const lightScore = inGH.any ? 96 : (isSunriseSpot || isSunsetSpot) ? 88 : isViewpoint ? 75 : 60;
  const weatherScore = weatherIntel ? Math.max(20, Math.min(100, weatherIntel.score || 80)) : 78;
  const visibilityScore = weatherIntel?.visibilityKm ? (weatherIntel.visibilityKm >= 10 ? 95 : weatherIntel.visibilityKm >= 5 ? 80 : 50) : 85;
  const cloudScore = weatherIntel?.cloudCover != null ? (weatherIntel.cloudCover >= 20 && weatherIntel.cloudCover <= 60 ? 94 : weatherIntel.cloudCover > 85 ? 45 : 75) : 80;
  const crowdScore = (place.reviewCount && place.reviewCount > 10000) ? 65 : 88;
  const orientationScore = orientationSupported ? (orientationDelta <= 25 ? 96 : orientationDelta <= 60 ? 82 : 55) : 80;

  const componentScores = {
    light: lightScore,
    weather: weatherScore,
    visibility: visibilityScore,
    cloud: cloudScore,
    crowd: crowdScore,
    orientation: orientationScore,
  };

  const confidence = weatherIntel?.source === 'live' ? 92 : orientationSupported ? 88 : 80;

  return {
    score,
    suitability,
    types,
    reasons: reasons.length ? reasons : ['Pleasant visual conditions'],
    bestWindow,
    peakMoment,
    componentScores,
    confidence,
    solar: solar ? { elevation: solar.elevation, azimuth: solar.azimuth } : null,
    orientationDelta,
  };
}

module.exports = {
  solarPosition,
  angularDifference,
  computeScenic,
};
