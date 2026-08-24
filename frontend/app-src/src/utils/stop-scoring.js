/**
 * Time-aware stop scoring — strongly prefers correct daypart + meal slots + personas.
 */
export function dayPartForMinutes(mins) {
  if (mins < 11 * 60) return 'Morning';
  if (mins < 16 * 60) return 'Afternoon';
  if (mins < 20 * 60) return 'Evening';
  return 'Night';
}

export function climateMode(temp) {
  if (temp == null || !Number.isFinite(temp)) return 'mild';
  if (temp >= 35) return 'hot';
  if (temp <= 18) return 'cool';
  return 'mild';
}

function normPersonas(personas) {
  return (personas || []).map((p) => String(p).toLowerCase().replace(/\s+/g, '_'));
}

export function tripModeBonus(stop, tripMode) {
  if (!tripMode) return 0;
  const mode = String(tripMode).toLowerCase();
  if (mode === 'relaxed' && (stop.cat === 'scenic' || stop.cat === 'park' || stop.cat === 'beach')) return 8;
  if (mode === 'packed' && stop.importance === 'must_see') return 6;
  if (mode === 'cultural' && (stop.cat === 'temple' || stop.cat === 'museum' || stop.cat === 'fort')) return 10;
  if ((mode === 'foodie' || mode === 'group') && stop.cat === 'food') return 12;
  return 0;
}

export function personaBonus(stop, personas) {
  if (!personas || !personas.length) return 0;
  let b = 0;
  const set = new Set(normPersonas(personas));
  const cat = String(stop.cat || '').toLowerCase();
  if (set.has('photographer') && (stop.is_sunrise_spot || stop.is_sunset_spot || cat === 'scenic' || cat === 'beach')) b += 14;
  if (set.has('family') && (stop.family_friendly || cat === 'park' || cat === 'museum')) b += 10;
  if (set.has('history') && (cat === 'fort' || cat === 'monument' || cat === 'museum' || cat === 'temple')) b += 12;
  if ((set.has('foodie') || set.has('food_lover') || set.has('food-lover')) && cat === 'food') b += 16;
  if (set.has('spiritual') && cat === 'temple') b += 12;
  if (set.has('adventure') && (cat === 'trekking' || cat === 'hiking' || cat === 'hill' || cat === 'waterfall' || cat === 'beach')) b += 16;
  if (set.has('nature') && (cat === 'trekking' || cat === 'hiking' || cat === 'park' || cat === 'scenic' || cat === 'beach' || cat === 'garden')) b += 12;
  return b;
}

/** Minutes-of-day inside any [start,end] window list like [["05:30","07:30"],...] */
export function inBestHours(arriveMin, bestHours) {
  if (!Array.isArray(bestHours) || !bestHours.length) return null;
  for (const w of bestHours) {
    if (!Array.isArray(w) || w.length < 2) continue;
    const [a, b] = w;
    const start = typeof a === 'number' ? a : (() => { const [h, m] = String(a).split(':').map(Number); return h * 60 + (m || 0); })();
    const end = typeof b === 'number' ? b : (() => { const [h, m] = String(b).split(':').map(Number); return h * 60 + (m || 0); })();
    if (arriveMin >= start && arriveMin <= end) return true;
  }
  return false;
}

export function stopTimeScore(stop, arriveMin, temp, priorityIndex = 0, wind = 0, personas = null, tripMode = null) {
  let score = 55 - priorityIndex * 1.5;
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  const cat = String(stop.cat || '').toLowerCase();

  // --- Category × daypart (core time intelligence) ---
  if (cat === 'trekking' || cat === 'hiking') {
    if (part === 'Morning' || (arriveMin >= 15.5 * 60 && arriveMin <= 18.5 * 60)) score += 26;
    else if (part === 'Afternoon' && climate === 'hot') score -= 22;
    else if (part === 'Night') score -= 25;
  }
  if (cat === 'beach' || cat === 'scenic') {
    if (part === 'Morning' || (arriveMin >= 16.5 * 60 && arriveMin <= 18.5 * 60)) score += 24;
    else if (part === 'Afternoon') score -= 18;
    else if (part === 'Night') score -= 10;
  }
  if (cat === 'temple') {
    if (part === 'Morning' || (arriveMin >= 17 * 60 && arriveMin <= 19.5 * 60)) score += 22;
    else if (part === 'Afternoon') score -= 12;
  }
  if (cat === 'food' || cat === 'restaurant') {
    if ((arriveMin >= 11.5 * 60 && arriveMin <= 15 * 60) || (arriveMin >= 18.5 * 60 && arriveMin <= 21.5 * 60)) score += 30;
    else score -= 25;
  }
  if (cat === 'park' || cat === 'garden') {
    if (part === 'Morning' || part === 'Evening') score += 10;
    if (part === 'Afternoon' && climate === 'hot') score -= 14;
  }
  if (cat === 'museum' || cat === 'fort') {
    if (part === 'Morning' || part === 'Afternoon') score += 12;
  }

  // Explicit best_hours when present
  const bh = inBestHours(arriveMin, stop.best_hours || stop.bestHours);
  if (bh === true) score += 28;
  if (bh === false) score -= 30;

  if (stop.is_sunrise_spot && arriveMin >= 5.5 * 60 && arriveMin <= 7.5 * 60) score += 22;
  if (stop.is_sunset_spot && arriveMin >= 17 * 60 && arriveMin <= 18.5 * 60) score += 22;
  if (stop.has_nightlife && arriveMin >= 19 * 60) score += 14;
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && part === 'Afternoon') score += 14;
  if (stop.indoor_outdoor === 'outdoor' && climate === 'hot' && part === 'Afternoon') score -= 12;
  if (wind >= 30 && (cat === 'beach' || cat === 'scenic')) score -= 8;

  score += tripModeBonus(stop, tripMode);
  score += personaBonus(stop, personas);

  return score;
}

export function stopClimateNote(stop, temp) {
  const climate = climateMode(temp);
  if (climate === 'hot' && stop.indoor_outdoor === 'outdoor') return 'Hot — prefer shade/indoor breaks';
  if (climate === 'cool' && stop.indoor_outdoor === 'outdoor') return 'Cool outdoor weather';
  return '';
}
