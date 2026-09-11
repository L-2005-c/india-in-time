'use strict';

/**
 * services/travelIntelligence/experience/experienceWindowEngine.js
 *
 * Deterministic Temporal Viability & Experience Window Engine for India In-Time v3.0 Phase 4.
 * Computes opening, lighting, crowd, and weather windows without hallucinating missing data.
 */

const { calculateSolarTimes } = require('../astronomyTime');
const { t2m, m2t } = require('../timeEngine');

/**
 * Evaluates the multi-dimensional experience window for a place at a target minute.
 *
 * @param {Object} place - Candidate place object
 * @param {Object} options
 * @param {number} [options.currentMinute] - Current journey minute (from midnight IST)
 * @param {Date} [options.referenceDate] - Date object
 * @param {Object} [options.weather] - Weather telemetry / forecast
 * @param {number} [options.visitMinutes=60] - Expected stay duration
 * @returns {Object} Structured window assessment
 */
function evaluatePlaceExperienceWindow(place = {}, {
  currentMinute = 600,
  referenceDate = new Date(),
  weather = null,
  visitMinutes = 60,
} = {}) {
  const lat = Number(place.lat || place.latitude || place.coords?.[0] || 17.6868);
  const lon = Number(place.lon || place.longitude || place.coords?.[1] || 83.2185);
  const stay = Number(place.visitMinutes || place.visit_minutes || visitMinutes || 60);

  const solarTimes = calculateSolarTimes(lat, lon, referenceDate);
  const sunriseMin = solarTimes ? (solarTimes.sunrise ?? solarTimes.sunriseMin ?? 360) : 360;
  const sunsetMin = solarTimes ? (solarTimes.sunset ?? solarTimes.sunsetMin ?? 1110) : 1110;
  const morningGoldenStart = solarTimes?.morningGoldenHour?.start ?? Math.max(0, sunriseMin - 15);
  const morningGoldenEnd = solarTimes?.morningGoldenHour?.end ?? (sunriseMin + 45);
  const eveningGoldenStart = solarTimes?.eveningGoldenHour?.start ?? Math.max(0, sunsetMin - 45);
  const eveningGoldenEnd = solarTimes?.eveningGoldenHour?.end ?? (sunsetMin + 15);

  const nowMin = Number(currentMinute);
  const arrivalMin = nowMin;
  const departureMin = nowMin + stay;

  const reasons = [];
  let temporalScore = 50;

  // 1. Opening Hours Feasibility
  let isWithinOpeningHours = true;
  let closingRisk = false;
  let openingStatus = 'UNKNOWN';
  const openTime = place.ot || null;
  const closeTime = place.ct || null;
  let minutesToClose = null;
  let minutesToOpen = null;

  const hasOt = place.ot != null && String(place.ot).includes(':');
  const hasCt = place.ct != null && String(place.ct).includes(':');

  if (!hasOt && !hasCt) {
    reasons.push('Hours not formally registered (assumed flexible)');
  } else {
    const openMin = t2m(place.ot, 6 * 60);
    const closeMin = t2m(place.ct, 20 * 60);

    const isWithinHours = closeMin <= openMin
      ? (nowMin >= openMin || nowMin < closeMin)
      : (nowMin >= openMin && nowMin < closeMin);

    if (isWithinHours) {
      minutesToClose = closeMin >= nowMin ? closeMin - nowMin : 1440 - nowMin + closeMin;
      if (minutesToClose < stay) {
        isWithinOpeningHours = false;
        closingRisk = true;
        openingStatus = 'CLOSING_SOON';
        temporalScore = 20;
        reasons.push(`Insufficient time before closing (${minutesToClose}m remaining vs ${stay}m needed)`);
      } else if (minutesToClose <= 45) {
        closingRisk = true;
        openingStatus = 'CLOSING_SOON';
        temporalScore += 5;
        reasons.push(`Closing soon (${minutesToClose}m remaining)`);
      } else {
        openingStatus = 'OPEN';
        temporalScore += 25;
        reasons.push('Fully open during target window');
      }
    } else {
      isWithinOpeningHours = false;
      openingStatus = 'CLOSED';
      temporalScore = 10;
      reasons.push(`Closed at ${m2t(nowMin)} (operating hours: ${place.ot || '06:00'}–${place.ct || '20:00'})`);
      if (openMin > nowMin) {
        minutesToOpen = openMin - nowMin;
      }
    }
  }

  // 2. Solar & Photographic Lighting
  const isSunsetSpot = !!(place.is_sunset_spot || place.isSunsetSpot || /sunset|viewpoint|beach|hill|lake/i.test(place.name || place.cat));
  const isSunriseSpot = !!(place.is_sunrise_spot || place.isSunriseSpot || /sunrise|morning/i.test(place.name || place.cat));
  const isOutdoor = !['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping', 'indoor'].includes(String(place.cat || place.category).toLowerCase());

  let isGoldenHour = false;
  let isNightNow = false;

  const overlapsEveningGolden = (arrivalMin <= eveningGoldenEnd + 15 && departureMin >= eveningGoldenStart - 10);
  const overlapsMorningGolden = (arrivalMin <= morningGoldenEnd + 15 && departureMin >= morningGoldenStart - 10);

  if (overlapsEveningGolden) {
    isGoldenHour = true;
    if (isSunsetSpot) {
      temporalScore += 30;
      reasons.push('Peak golden/sunset lighting alignment for scenic viewpoint');
    } else if (isOutdoor) {
      temporalScore += 15;
      reasons.push('Favorable evening golden hour lighting');
    }
  } else if (overlapsMorningGolden) {
    isGoldenHour = true;
    if (isSunriseSpot) {
      temporalScore += 30;
      reasons.push('Optimal morning sunrise alignment');
    } else if (isOutdoor) {
      temporalScore += 15;
      reasons.push('Pleasant morning lighting conditions');
    }
  }

  if (arrivalMin >= sunsetMin + 30 || arrivalMin < sunriseMin - 30) {
    isNightNow = true;
    if (isOutdoor && !place.night_availability && place.cat !== 'food' && place.cat !== 'shopping') {
      temporalScore -= 20;
      reasons.push('Night conditions: limited visibility for outdoor attraction');
    }
  }

  // 3. Crowd / Midday Heat Factors
  const isPeakHeat = arrivalMin >= 12 * 60 && arrivalMin <= 15 * 60;
  if (isPeakHeat && isOutdoor) {
    temporalScore -= 15;
    reasons.push('High midday solar heat exposure');
  }

  // 4. Weather Viability
  if (weather) {
    const isRaining = weather.isRaining || (weather.rainfallMmPerHour && weather.rainfallMmPerHour > 2.0);
    if (isRaining && isOutdoor) {
      temporalScore -= 30;
      reasons.push('Active precipitation degrades outdoor experience');
    } else if (isRaining && !isOutdoor) {
      temporalScore += 20;
      reasons.push('Indoor haven optimal during rain');
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(temporalScore)));

  // Viability classification
  let windowViability = 'NOW';
  if (!isWithinOpeningHours) {
    windowViability = 'CLOSED';
  } else if (finalScore < 40) {
    windowViability = 'LATER';
  }

  return {
    placeId: place.id || place.name,
    targetMinute: nowMin,
    targetTime: m2t(nowMin),
    stayMinutes: stay,
    projectedDepartureMinute: departureMin,
    temporalScore: finalScore,
    isWithinOpeningHours,
    closingRisk,
    windowViability,
    isGoldenHour,
    isNightNow,
    openingDetails: {
      status: openingStatus,
      label: isWithinOpeningHours ? (closingRisk ? 'Closing soon' : 'Open now') : (openingStatus === 'UNKNOWN' ? 'Hours unknown' : 'Currently Closed'),
      openTime,
      closeTime,
      minutesToClose,
      minutesToOpen,
      hoursUnknown: openingStatus === 'UNKNOWN',
    },
    solarContext: {
      sunrise: m2t(sunriseMin),
      sunset: m2t(sunsetMin),
      goldenHour: isGoldenHour,
    },
    reasons,
  };
}

module.exports = {
  evaluatePlaceExperienceWindow,
};
