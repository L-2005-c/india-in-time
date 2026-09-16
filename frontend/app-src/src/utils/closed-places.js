/**
 * Closed Places Filter — Frontend detection for permanently closed, defunct, or demolished places.
 */

const PERMANENTLY_CLOSED_PATTERNS = [
  /\b(permanently\s*closed|closed\s*permanently)\b/i,
  /\b(temporarily\s*closed|closed\s*temporarily)\b/i,
  /\b(closed\s+down|shut\s+down|permanently\s+shut|closed\s+forever)\b/i,
  /\b(defunct|demolished|abandoned|out\s*of\s*business|ceased\s*operations)\b/i,
  /\bno\s+longer\s+(?:exists?|operational|operating|open)\b/i,
  /\b(non-operational|not\s+operational|decommissioned)\b/i,
  /\((?:permanently\s+)?closed(?:\s+down)?\)/i,
  /\[(?:permanently\s+)?closed(?:\s+down)?\]/i,
  /\((?:defunct|demolished|abandoned|shut)\)/i,
  /\[(?:defunct|demolished|abandoned|shut)\]/i,
];

const KNOWN_DEFUNCT_ATTRACTIONS = new Set([
  'mgm selvee water world',
  'mgm water park',
  'mgm water park vizag',
  'taraka rama water park',
  'mudfort amusement park',
  'hubba bubba amusement park',
  'appu ghar',
  'appu ghar okhla',
  'appu ghar pragati maidan',
  'great india place water park',
  'fantasy land',
  'fantasy land mumbai',
  'fantasy land jogeshwari',
  'dash n splash',
  'dash n splash chennai',
  'dolphin city',
  'dolphin city chennai',
  'coral reef aquarium',
  'coral reef aquarium vizag',
  'victoria public hall',
  'esselworld',
  'essel world',
  'dias park',
  'ansal riverdale',
]);

/**
 * Returns true if a place is permanently closed, defunct, or demolished.
 * @param {object} place
 * @returns {boolean}
 */
export function isPermanentlyClosedPlace(place) {
  if (!place || typeof place !== 'object') return false;

  const name = String(place.name || place.canonicalName || place.title || '').trim();
  const nameNorm = name.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (KNOWN_DEFUNCT_ATTRACTIONS.has(nameNorm)) return true;
  for (const defunct of KNOWN_DEFUNCT_ATTRACTIONS) {
    if (nameNorm.includes(defunct) || defunct.includes(nameNorm)) {
      if (nameNorm.length >= 8 && defunct.length >= 8) return true;
    }
  }

  for (const pattern of PERMANENTLY_CLOSED_PATTERNS) {
    if (pattern.test(name)) return true;
  }

  const combinedText = [
    name,
    place.display_name,
    place.displayName,
    place.description,
    place.about,
    place.why,
    place.explanation,
    place.notes,
    place.details,
    place.summary,
    place.comment,
  ].filter(Boolean).join(' ');

  for (const pattern of PERMANENTLY_CLOSED_PATTERNS) {
    if (pattern.test(combinedText)) return true;
  }

  const busStatus = String(place.business_status || place.businessStatus || '').toUpperCase();
  if (busStatus === 'CLOSED_PERMANENTLY' || busStatus === 'PERMANENTLY_CLOSED' || busStatus === 'CLOSED_TEMPORARILY' || busStatus === 'TEMPORARILY_CLOSED' || busStatus === 'CLOSED') {
    return true;
  }

  const opStatus = String(place.operationalStatus || place.operational_status || place.status || place.tourismStatus || '').toUpperCase();
  if (opStatus === 'PERMANENTLY_CLOSED' || opStatus === 'CLOSED_PERMANENTLY' || opStatus === 'DEFUNCT' || opStatus === 'CLOSED' || opStatus === 'CLOSED_TEMPORARILY' || opStatus === 'TEMPORARILY_CLOSED' || opStatus === 'INACTIVE') {
    return true;
  }

  if (place.isPermanentlyClosed === true || place.permanentlyClosed === true || place.isClosed === true || place.is_closed === true || place.closed === true) {
    return true;
  }

  const tags = place.tags || place.osm_tags || place.extratags || {};
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags.demolished === 'yes' || tags.ruins === 'yes') return true;
  if (tags.historic === 'ruins' && !tags.tourism) return true;
  const tagOpStatus = String(tags.operational_status || tags.business_status || tags.status || '').toLowerCase();
  if (tagOpStatus === 'closed' || tagOpStatus === 'closed_permanently' || tagOpStatus === 'permanently_closed') {
    return true;
  }
  const tagOpening = String(tags.opening_hours || '').toLowerCase();
  if (tagOpening === 'closed' || tagOpening === 'permanently closed') {
    return true;
  }
  if (tags.end_date) return true;

  return false;
}
