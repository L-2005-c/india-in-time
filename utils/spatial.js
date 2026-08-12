// utils/spatial.js — Advanced GIS helpers beyond basic Haversine
// Pure functions: bbox, point-in-bbox, clustering, simple geohash, bearing.

function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bounding box around a point for radiusKm */
function bboxAround(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos(toRad(lat)) || 1e-6);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

function pointInBbox(lat, lon, bbox) {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon
  );
}

/** Filter places within radiusKm of origin */
function filterWithinRadius(places, lat, lon, radiusKm) {
  const bbox = bboxAround(lat, lon, radiusKm);
  return (places || []).filter((p) => {
    const [plat, plon] = p.coords || [p.lat, p.lon];
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) return false;
    if (!pointInBbox(plat, plon, bbox)) return false;
    return haversineKm(lat, lon, plat, plon) <= radiusKm;
  });
}

/** Initial bearing from A to B in degrees (0–360) */
function bearingDegrees(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Simple geohash-like cell id (not full geohash algorithm — grid quantize).
 * Useful for spatial bucketing / cache keys.
 */
function gridCellId(lat, lon, precision = 3) {
  const scale = 10 ** precision;
  return `${Math.round(lat * scale)}_${Math.round(lon * scale)}`;
}

/**
 * Greedy nearest-neighbor order starting from (lat, lon).
 */
function orderNearestNeighbor(places, lat, lon) {
  const remaining = (places || []).map((p, i) => ({ p, i }));
  const ordered = [];
  let curLat = lat;
  let curLon = lon;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const [plat, plon] = remaining[i].p.coords || [remaining[i].p.lat, remaining[i].p.lon];
      const d = haversineKm(curLat, curLon, plat, plon);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next.p);
    const [plat, plon] = next.p.coords || [next.p.lat, next.p.lon];
    curLat = plat;
    curLon = plon;
  }
  return ordered;
}

module.exports = {
  haversineKm,
  bboxAround,
  pointInBbox,
  filterWithinRadius,
  bearingDegrees,
  gridCellId,
  orderNearestNeighbor,
};
