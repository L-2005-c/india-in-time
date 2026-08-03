// ══════════════════════════════════════════════════
// Pure utility functions — no side effects, no DOM access
// ══════════════════════════════════════════════════

/** Parse "HH:MM" → total minutes from midnight. */
export function t2m(s, fallback = 0) {
  if (typeof s !== 'string' || !s.includes(':')) return fallback;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Total minutes → "HH:MM" (24h). */
export function m2t(m) {
  const safe = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Total minutes → "Xh Ym" display string. */
export function fmtM(m) {
  if (!m && m !== 0) return '--';
  const mins = Math.round(m);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

/** Haversine distance in km between two lat/lon pairs. */
export function hvKm(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True if both lat and lon are finite numbers. */
export function isFiniteLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

/** True if coords is a [lat, lon] array with finite numbers. */
export function hasValidCoords(coords) {
  return Array.isArray(coords) && coords.length >= 2 && isFiniteLatLon(coords[0], coords[1]);
}

/**
 * Normalize [lat, lon] — if it looks swapped (common in older saved plans
 * where the India range for lat is 6-38 and lon is 68-98), fix it.
 */
export function normalizeLatLon(coords) {
  const a = Number(coords?.[0]);
  const b = Number(coords?.[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) return coords;
  const aIsLat = a >= 6 && a <= 38;
  const aIsLon = a >= 68 && a <= 98;
  const bIsLat = b >= 6 && b <= 38;
  const bIsLon = b >= 68 && b <= 98;
  if (aIsLat && bIsLon) return [a, b];
  if (aIsLon && bIsLat) return [b, a];
  return [a, b];
}

/** Current local time as minutes-from-midnight. */
export function getCurrentLocalMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Format a Date as "H:MM AM/PM". */
export function fmt12(d) {
  const h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm} ${ap}`;
}

// ── Deduplication helpers ────────────────────────────────────────────────────

const DEDUPE_STOPWORDS = new Set([
  'the', 'of', 'and', 'temple', 'beach', 'fort', 'park', 'museum', 'lake',
  'garden', 'road', 'street', 'point', 'view', 'city', 'centre', 'center'
]);

/** Extract meaningful (4+ char, non-stopword) words from a place name. */
export function significantWords(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 4 && !DEDUPE_STOPWORDS.has(w));
}

/**
 * De-duplicate places that share a significant word AND are within ~180m
 * of each other — keeps the stronger one (by importanceScore).
 */
export function dedupePlacesByProximity(list) {
  const all = [...list].sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));
  const kept = [];
  for (const place of all) {
    if (!hasValidCoords(place?.coords)) continue;
    const words = significantWords(place.name);
    const dup = kept.find(k => {
      if (!hasValidCoords(k.coords)) return false;
      const d = hvKm(k.coords[0], k.coords[1], place.coords[0], place.coords[1]);
      if (d > 0.18) return false;
      const kWords = significantWords(k.name);
      return words.some(w => kWords.includes(w));
    });
    if (dup) {
      dup.importanceScore = Math.max(dup.importanceScore || 0, place.importanceScore || 0);
      dup.isHiddenGem = dup.isHiddenGem || place.isHiddenGem;
      continue;
    }
    kept.push(place);
  }
  return kept;
}
