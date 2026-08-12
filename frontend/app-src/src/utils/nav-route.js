/**
 * Live navigation geometry helpers (extracted from core/app.js).
 */

export function closestPointOnSegment(p, a, b) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1];
  const px = p[0], py = p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: [ax, ay], t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: [ax + t * dx, ay + t * dy], t };
}

/**
 * Snap lat/lon to nearest point on a polyline path [[lat,lon],...].
 * @param {function} distFn (lat1,lon1,lat2,lon2) => km
 */
export function snapToRoute(lat, lon, path, distFn) {
  if (!path || path.length < 2) return { lat, lon, snapped: false, distKm: 0 };
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const { point } = closestPointOnSegment([lat, lon], path[i], path[i + 1]);
    const d = distFn(lat, lon, point[0], point[1]);
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  if (!best) return { lat, lon, snapped: false, distKm: 0 };
  return { lat: best[0], lon: best[1], snapped: true, distKm: bestD };
}

export function turnArrowForInstruction(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('left')) return '⬅️';
  if (t.includes('right')) return '➡️';
  if (t.includes('u-turn') || t.includes('uturn')) return '↩️';
  if (t.includes('arrive') || t.includes('destination')) return '📍';
  return '⬆️';
}

/** Whether TTS should speak this instruction (rate limit + dedupe). */
export function shouldSpeakNavInstruction(text, lastText, lastAt, now = Date.now(), minGapMs = 8000) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t === lastText && now - lastAt < minGapMs * 2) return false;
  if (now - lastAt < minGapMs) return false;
  return true;
}
