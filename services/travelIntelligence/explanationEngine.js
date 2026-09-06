// explanationEngine.js
function buildExplanation(intel = {}) {
  const positives = [], cautions = [], neutrals = [];
  const { visitScore, visitLabel, opening, crowd, weather, traffic, scenic, arrival, cultural, thermalComfort, cloudInversion } = intel;
  if (opening) {
    if (opening.status === 'OPEN') positives.push('Place is open');
    else if (opening.status === 'CLOSING_SOON') cautions.push(`Closing soon (${opening.minutesToClose} min)`);
    else if (opening.status === 'OPENS_SOON') neutrals.push(`Opens in ${opening.minutesToOpen} min`);
    else if (opening.status === 'CLOSED') cautions.push('Currently closed');
    else neutrals.push('Opening hours unknown');
  }

  // Cultural & Temple Ritual Intelligence
  if (cultural) {
    if (cultural.activeRitual) {
      positives.push(`Auspicious timing: ${cultural.activeRitual.name} (${cultural.activeRitual.note || 'active ritual'})`);
    }
    if (cultural.isSanctumClosure) {
      cautions.push(`Temple sanctum afternoon closure (${cultural.sanctumClosureWindow || '12:30–15:30'})`);
    }
    if (cultural.prasad) {
      positives.push(`Specialty Prasadam: ${cultural.prasad}`);
    }
  }

  // Cloud Inversion & Mountain Mist
  if (cloudInversion) {
    positives.push('Peak cloud-ocean inversion window (dense floating mist above peaks)');
  }

  // Thermal Comfort & Heat Refuge
  if (thermalComfort?.isMiddayHaven) {
    positives.push('Cool indoor sanctuary during peak afternoon solar heat');
  }

  if (crowd) {
    if (['Very Low', 'Low'].includes(crowd.level)) positives.push(`Low predicted crowd (${crowd.level})`);
    else if (crowd.level === 'Moderate') neutrals.push('Moderate predicted crowd');
    else cautions.push(`Higher predicted crowd (${crowd.level})`);
  }
  if (weather) {
    if (weather.suitability === 'Excellent' || weather.suitability === 'Good') positives.push(`Weather: ${weather.suitability}`);
    else if (weather.suitability === 'Fair') neutrals.push(`Weather: ${weather.suitability}`);
    else if (weather.suitability !== 'Unknown') cautions.push(`Weather: ${weather.suitability}`);
    (weather.warnings || []).forEach((w) => cautions.push(w));
  }
  if (scenic) {
    if (scenic.suitability === 'Excellent' || scenic.suitability === 'Good') positives.push(`Scenic: ${scenic.suitability}`);
    if (scenic.scenicTypes?.some((t) => ['golden-hour', 'sunset', 'sunrise'].includes(t))) positives.push('Favourable light / golden-hour alignment');
  }
  if (traffic) {
    if (traffic.isGhatRoad) {
      neutrals.push('Highland ghat road transit (hairpin turns & scenic mountain pass)');
      if (traffic.ghatNightAdvisory) cautions.push(traffic.ghatNightAdvisory);
    } else {
      if (traffic.trafficLevel === 'Low') positives.push('Low traffic risk');
      else if (traffic.trafficLevel === 'High') cautions.push('Elevated traffic expected');
      else if (traffic.trafficLevel === 'Moderate') neutrals.push('Moderate traffic');
    }
  }
  if (arrival?.recommendedDeparture) neutrals.push(`Recommended departure ~${arrival.recommendedDeparture}`);
  const summaryParts = [];
  if (visitLabel) summaryParts.push(`${visitLabel} (${visitScore ?? '—'}/100)`);
  if (crowd?.level) summaryParts.push(`Crowd: ${crowd.level}`);
  if (weather?.suitability && weather.suitability !== 'Unknown') summaryParts.push(`Weather: ${weather.suitability}`);
  return { summary: summaryParts.join(' · ') || 'Recommendation generated from available signals', positives, cautions, neutrals, bullets: [...positives.map((p) => ({ type: 'positive', text: p })), ...cautions.map((c) => ({ type: 'caution', text: c })), ...neutrals.map((n) => ({ type: 'neutral', text: n }))] };
}
function buildStatusLabel(intel = {}) {
  const { opening, visitLabel, crowd, weather, scenic, daypart, nightAvailable, cultural, cloudInversion } = intel;
  if (cultural?.isSanctumClosure) return 'Midday sanctum rest — visit for evening aarti';
  if (cloudInversion) return 'Sunrise cloud inversion peak';
  if (opening?.status === 'CLOSED' || opening?.isOpenNow === false) return opening?.label || 'Currently Closed';
  if (opening?.status === 'CLOSING_SOON') return opening.label || 'Closing Soon';
  if (nightAvailable && daypart === 'night') return 'Open at night';
  if (weather?.warnings?.some((w) => /extreme heat|hot outside/i.test(w))) return 'Hot outside — consider an indoor break';
  if (visitLabel === 'Exceptional' || visitLabel === 'Excellent') return `${visitLabel} time to visit`;
  if (scenic?.scenicTypes?.includes('sunset') && scenic.bestScenicWindow) return 'Great sunset spot — golden hour approaching';
  if (scenic?.scenicTypes?.includes('sunrise') && scenic.bestScenicWindow) return 'Excellent sunrise window';
  if (crowd?.level === 'Very High' || crowd?.level === 'High') return `Open — ${crowd.level} crowd expected`;
  return opening?.label || 'Good time to visit';
}

/**
 * Generates unified, plain-language "Why India In-Time Chose This Plan" reasoning.
 * Answers:
 * 1. WHAT is recommended?
 * 2. WHEN?
 * 3. WHY?
 * 4. BASED ON WHAT?
 * 5. HOW FRESH IS THE INFORMATION?
 * 6. HOW CERTAIN IS IT?
 */
function buildWhyThisPlanExplanation({
  placeName = 'This destination',
  arrivalTime = '12:00',
  _intel = {},
  weather = null,
  crowd = null,
  traffic = null,
  scenic = null,
  cultural = null,
  safety = null,
} = {}) {
  const reasons = [];

  // 1. Weather evidence
  if (weather && weather.suitability && weather.suitability !== 'Unknown') {
    if (weather.suitability === 'Excellent' || weather.suitability === 'Good') {
      const tempPart = weather.tempC != null ? ` (${weather.tempC}°C)` : '';
      reasons.push(`🌦️ Weather is favourable${tempPart}`);
    } else if (weather.indoorRecommended) {
      reasons.push('🏛️ Indoor venue protects from external weather');
    }
  }

  // 2. Crowd evidence
  if (crowd && crowd.level && crowd.level !== 'UNKNOWN') {
    if (['Very Low', 'Low'].includes(crowd.level)) {
      const waitStr = crowd.estimatedWaitRange ? ` (${crowd.estimatedWaitRange} wait)` : '';
      reasons.push(`👥 Low crowd expected${waitStr}`);
    } else if (crowd.level === 'Moderate') {
      reasons.push('👥 Typical moderate crowd pattern');
    }
  }

  // 3. Traffic evidence
  if (traffic) {
    if (traffic.trafficLevel === 'Low' || traffic.trafficStatus === 'LOW' || traffic.trafficStatus === 'FREE_FLOW') {
      reasons.push('🚗 Road traffic is light');
    } else if (traffic.isGhatRoad) {
      reasons.push('⛰️ Mountain ghat corridor scheduled during daylight visibility');
    }
  }

  // 4. Scenic / Solar / Photography
  if (scenic) {
    if (scenic.isBestScenicWindow || (scenic.scenicTypes && scenic.scenicTypes.includes('sunset'))) {
      reasons.push('🌅 Optimal natural light / golden hour alignment');
    } else if (scenic.scenicTypes && scenic.scenicTypes.includes('sunrise')) {
      reasons.push('🌄 Crisp morning sunrise visibility');
    }
  }

  // 5. Cultural / Darshan
  if (cultural) {
    if (cultural.activeRitual) {
      reasons.push(`🛕 Aligned with ${cultural.activeRitual.name || 'ritual'}`);
    } else if (cultural.isSanctumOpen !== false) {
      reasons.push('🛕 Darshan & sanctum open');
    }
  }

  // 6. Safety
  if (safety && safety.hasHazard) {
    reasons.push(`⚠️ Route-level safety advisory active: ${safety.alerts?.[0] || 'Exercise caution'}`);
  }

  const plainNarrative = reasons.length > 0
    ? reasons.join(' · ')
    : 'Selected because the attraction is open and aligns with efficient transit routing.';

  return {
    heading: `Why India In-Time chose ${arrivalTime} for ${placeName}`,
    recommendedArrival: arrivalTime,
    reasons,
    narrative: plainNarrative,
    evidenceCount: reasons.length,
    confidence: reasons.length >= 3 ? 'HIGH' : (reasons.length >= 1 ? 'MEDIUM' : 'LOW'),
  };
}

module.exports = { buildExplanation, buildStatusLabel, buildWhyThisPlanExplanation };


