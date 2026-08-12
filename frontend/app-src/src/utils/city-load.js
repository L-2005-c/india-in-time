/**
 * City / places loading pure helpers.
 */

export function normalizeFetchedPlaces(places, normalizeLatLon) {
  return (places || []).map((p) => ({
    ...p,
    coords: typeof normalizeLatLon === 'function' ? normalizeLatLon(p.coords) : p.coords,
  }));
}

export function placesLoadCacheKey(lat, lon, cityName) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}:${String(cityName || '').toLowerCase()}`;
}

export function shouldRefetchPlaces(cached, minCount = 1, maxAgeMs = 30 * 60 * 1000) {
  if (!cached || !cached.places) return true;
  if ((cached.places.length || 0) < minCount) return true;
  if (cached.at && Date.now() - cached.at > maxAgeMs) return true;
  return false;
}

export function pickNearestCityId(lat, lon, citiesMap, distFn) {
  let bestId = null;
  let bestD = Infinity;
  for (const [id, city] of Object.entries(citiesMap || {})) {
    if (city?.lat == null || city?.lon == null) continue;
    const d = distFn(lat, lon, city.lat, city.lon);
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  return bestId;
}
