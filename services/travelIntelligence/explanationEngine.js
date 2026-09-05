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
  if (weather?.warnings?.length) return weather.warnings[0];
  if (crowd?.level === 'Very High' || crowd?.level === 'High') return `Open — ${crowd.level} crowd expected`;
  return opening?.label || 'Good time to visit';
}
module.exports = { buildExplanation, buildStatusLabel };

