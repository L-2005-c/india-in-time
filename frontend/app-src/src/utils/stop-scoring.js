/**
 * Time-aware stop scoring for itinerary building (extracted from core/app.js).
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

export function tripModeBonus(stop, tripMode) {
  if (!tripMode) return 0;
  const mode = String(tripMode).toLowerCase();
  if (mode === 'relaxed' && (stop.cat === 'scenic' || stop.cat === 'park' || stop.cat === 'beach')) return 8;
  if (mode === 'packed' && stop.importance === 'must_see') return 6;
  if (mode === 'cultural' && (stop.cat === 'temple' || stop.cat === 'museum' || stop.cat === 'fort')) return 10;
  if (mode === 'foodie' && stop.cat === 'food') return 12;
  return 0;
}

export function personaBonus(stop, personas) {
  if (!personas || !personas.length) return 0;
  let b = 0;
  const set = new Set(personas.map((p) => String(p).toLowerCase()));
  if (set.has('photographer') && (stop.is_sunrise_spot || stop.is_sunset_spot || stop.cat === 'scenic')) b += 12;
  if (set.has('family') && (stop.family_friendly || stop.cat === 'park' || stop.cat === 'museum')) b += 10;
  if (set.has('history') && (stop.cat === 'fort' || stop.cat === 'monument' || stop.cat === 'museum')) b += 10;
  if (set.has('foodie') && stop.cat === 'food') b += 10;
  if (set.has('spiritual') && stop.cat === 'temple') b += 10;
  return b;
}

export function stopTimeScore(stop, arriveMin, temp, priorityIndex = 0, wind = 0, personas = null, tripMode = null) {
  let score = 50 - priorityIndex * 2;
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);

  if (stop.is_sunrise_spot && arriveMin >= 5.5 * 60 && arriveMin <= 7.5 * 60) score += 22;
  if (stop.is_sunset_spot && arriveMin >= 17 * 60 && arriveMin <= 18.5 * 60) score += 22;
  if (stop.has_nightlife && arriveMin >= 19 * 60) score += 14;
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && part === 'Afternoon') score += 14;
  if (stop.indoor_outdoor === 'outdoor' && climate === 'hot' && part === 'Afternoon') score -= 12;
  if (wind >= 30 && (stop.cat === 'beach' || stop.cat === 'scenic')) score -= 8;

  score += tripModeBonus(stop, tripMode);
  score += personaBonus(stop, personas);

  if (stop.cat === 'food') {
    if (arriveMin >= 12 * 60 && arriveMin <= 15 * 60) score += 14;
    else if (arriveMin >= 18 * 60 && arriveMin <= 22 * 60) score += 16;
    else if (arriveMin >= 9 * 60 && arriveMin < 11 * 60) score += 6;
    else score -= 6;
    if (/\b(cafe|coffee|breakfast|bakery)\b/i.test(stop.name || '') && part === 'Morning') score += 4;
    if (/\b(seafood|biryani|restaurant|mess|eatery|hotel)\b/i.test(stop.name || '') && part !== 'Morning') score += 3;
    return score;
  }
  if (stop.cat === 'temple') {
    if (part === 'Morning') score += 12;
    else if (part === 'Evening') score += 8;
    else if (part === 'Afternoon') score += 1;
    else score -= 5;
    return score;
  }
  if (stop.cat === 'beach') {
    if (climate === 'hot') {
      if (part === 'Morning' || part === 'Evening') score += 12;
      else score -= 8;
    } else if (part === 'Morning' || part === 'Evening') score += 9;
    else if (part === 'Afternoon') score += 3;
    else score -= 4;
    return score;
  }
  if (climate === 'hot') {
    if (part === 'Morning' || part === 'Evening') score += 8;
    else if (part === 'Afternoon') score -= 2;
  } else if (part === 'Morning' || part === 'Afternoon' || part === 'Evening') score += 6;
  else score -= 3;
  return score;
}

export function stopClimateNote(stop, arriveMin, temp) {
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  if (stop.is_sunrise_spot && arriveMin >= 5.5 * 60 && arriveMin <= 7.5 * 60) return '🌅 Sunrise View';
  if (stop.is_sunset_spot && arriveMin >= 17 * 60 && arriveMin <= 18.5 * 60) return '🌇 Sunset View';
  if (stop.has_nightlife && arriveMin >= 19 * 60) return '🍹 Nightlife';
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && part === 'Afternoon') return '🏛️ Indoor Heat Escape';
  if (stop.cat === 'food') {
    if (part === 'Afternoon') return 'Lunch Stop';
    if (part === 'Evening') return 'Sunset Snack';
    if (part === 'Night') return 'Dinner Stop';
    return 'Food Break';
  }
  if (stop.cat === 'beach' && climate === 'hot') return part === 'Morning' ? 'Cool Morning Window' : 'Best Near Sunset';
  if (stop.cat === 'temple') return part === 'Morning' ? 'Peaceful Morning Visit' : 'Calmer Evening Slot';
  if (climate === 'hot' && part === 'Afternoon') return 'Short Climate-Friendly Visit';
  return `${part} Highlight`;
}
