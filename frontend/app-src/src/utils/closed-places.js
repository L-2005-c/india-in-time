/**
 * Closed Places Filter — Frontend detection for permanently closed, defunct, or demolished places.
 */

const PERMANENTLY_CLOSED_PATTERNS = [
  /\bpermanently\s+closed\b/i,
  /\bdefunct\b/i,
  /\bdemolished\b/i,
  /\babandoned\b/i,
  /\bclosed\s+down\b/i,
  /\bshut\s+down\b/i,
  /\bno\s+longer\s+(?:exists?|operational|open)\b/i,
  /\bcease(?:d)?\s+operations\b/i,
  /\bout\s+of\s+business\b/i,
  /\bclosed\s+forever\b/i,
];

const KNOWN_DEFUNCT_ATTRACTIONS = new Set([
  'mgm selvee water world',
  'appu ghar okhla',
  'great india place water park',
]);

/**
 * Returns true if a place is permanently closed, defunct, or demolished.
 * @param {object} place
 * @returns {boolean}
 */
export function isPermanentlyClosedPlace(place) {
  if (!place || typeof place !== 'object') return false;

  const busStatus = String(place.business_status || place.businessStatus || '').toUpperCase();
  if (busStatus === 'CLOSED_PERMANENTLY' || busStatus === 'PERMANENTLY_CLOSED') return true;

  const opStatus = String(place.operationalStatus || place.operational_status || '').toUpperCase();
  if (opStatus === 'PERMANENTLY_CLOSED' || opStatus === 'DEFUNCT' || opStatus === 'CLOSED') return true;

  if (place.isPermanentlyClosed === true || place.permanentlyClosed === true) return true;

  const name = String(place.name || '').trim();
  const nameNorm = name.toLowerCase().replace(/\s+/g, ' ');
  if (KNOWN_DEFUNCT_ATTRACTIONS.has(nameNorm)) return true;

  const combinedText = `${name} ${place.description || ''} ${place.about || ''} ${place.why || ''} ${place.explanation || ''}`;
  for (const pattern of PERMANENTLY_CLOSED_PATTERNS) {
    if (pattern.test(combinedText)) return true;
  }

  const tags = place.tags || place.osm_tags || {};
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags.ruins === 'yes') return true;
  if (tags.historic === 'ruins' && !tags.tourism) return true;

  return false;
}
