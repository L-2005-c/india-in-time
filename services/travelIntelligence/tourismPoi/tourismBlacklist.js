'use strict';

/**
 * Tourism POI Blacklist — reject non-tourist geographic entities.
 *
 * A place existing on a map does NOT make it a tourist attraction.
 * This module hard-rejects localities, residential areas, generic
 * infrastructure, and other map noise before any ranking or intelligence.
 */

/** OSM / provider place types that are never tourist attractions */
const REJECT_OSM_TYPES = new Set([
  'suburb', 'locality', 'neighbourhood', 'neighborhood', 'residential',
  'administrative', 'boundary', 'hamlet', 'village', 'town', 'city',
  'county', 'state', 'country', 'quarter', 'borough', 'district',
  'municipality', 'province', 'region', 'island', 'continent',
  'house', 'houses', 'apartments', 'building', 'yes',
  'residential_area', 'industrial', 'commercial', 'retail',
  'bus_stop', 'bus_station', 'railway', 'station', 'halt',
  'tram_stop', 'subway_entrance', 'platform',
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'service',
  'pedestrian', 'track', 'path', 'footway', 'cycleway',
  'junction', 'roundabout', 'crossing',
  'school', 'university', 'college', 'kindergarten',
  'hospital', 'clinic', 'doctors', 'dentist', 'pharmacy',
  'police', 'fire_station', 'post_office', 'bank', 'atm',
  'embassy', 'courthouse', 'townhall', 'government',
  'office', 'company', 'factory', 'warehouse',
  'parking', 'parking_space', 'fuel', 'charging_station',
  'toilets', 'bench', 'waste_basket', 'drinking_water',
  'telephone', 'vending_machine',
]);

/** OSM classes that are never tourist (unless type is allowlisted elsewhere) */
const REJECT_OSM_CLASSES = new Set([
  'highway', 'boundary', 'place', 'building', 'office',
  'railway', 'aeroway', 'power', 'man_made',
]);

/**
 * Name patterns that strongly indicate a non-tourist entity.
 * Applied case-insensitively. Intentionally does NOT block mall names
 * that are established shopping destinations (those are validated by
 * whitelist / curated data / positive tourism signals).
 */
const LOCALITY_NAME_PATTERNS = [
  // Indian residential / locality suffixes and tokens
  /\b(nagar|colony|layout|phase|sector|ward|block|extension|enclave)\b/i,
  /\b(peta|palle|palli|palem|puram|pura|pet|pettah)\b/i,
  /\b(village|mandal|taluk|tehsil|district|division)\b/i,
  /\b(mohalla|chowk|galli|gali|basti|slum)\b/i,
  /\b(apartment|apartments|residency|residences|towers?|flats?)\b/i,
  /\b(housing\s*society|housing\s*board|hsg\s*board)\b/i,
  // Infrastructure / roads
  /\b(road|street|highway|bypass|expressway|ring\s*road)\b/i,
  /\b(junction|circle|cross|crossing|flyover|underpass)\b/i,
  /\b(bus\s*stop|bus\s*stand|bus\s*station|railway\s*station|metro\s*station)\b/i,
  /\b(auto\s*stand|taxi\s*stand|parking\s*lot)\b/i,
  // Generic administrative / area
  /\b(locality|suburb|neighbourhood|neighborhood|residential\s*area)\b/i,
  /\b(area|zone|division|ward\s*\d+)\b/i,
  // Services that are not tourist attractions
  /\b(police\s*station|hospital|clinic|school|college|university)\b/i,
  /\b(government\s*office|municipal|collectorate|court)\b/i,
  /\b(\batm\b|bank\s*branch|post\s*office)\b/i,
  // Generic commercial without tourism value
  /\b(supermarket|kirana|general\s*store|provision\s*store)\b/i,
  /\b(petrol\s*pump|fuel\s*station|gas\s*station)\b/i,
];

/**
 * Known non-tourist locality names for Visakhapatnam / common AP cities.
 * Explicit list complements regex for high-confidence rejection.
 */
const KNOWN_LOCALITY_NAMES = new Set([
  'marripalem', 'seethammadhara', 'dwaraka nagar', 'dwarakanagar',
  'maddilapalem', 'gajuwaka', 'pendurthi', 'anakapalle', 'anakapalli',
  'nad junction', 'nad', 'akuripalli', 'akuripalle',
  'mvp colony', 'mvp', 'asillmetta', 'asilmetta',
  'jagadamba junction', 'jagadamba', 'rtc complex',
  'siripuram', 'waltair', 'waltair uplands',
  'pendurthi', 'gopalapatnam', 'kancharapalem',
  'akkayyapalem', 'resapuvanipalem', 'resapuvanipalem',
  'chinna waltair', 'pedda waltair', 'lawsons bay colony',
  'daba gardens', 'daba garden', 'suryabagh',
  'venkojipalem', 'madhurawada', 'yendada',
  'kommadi', 'pendurthi', 'simhachalam', // area name alone; temple is separate
  'vizag steel plant', 'steel plant', 'vsp',
  'naval base', 'dockyard', 'harbour area',
  'old town', 'new town',
].map((s) => s.toLowerCase()));

/**
 * Tokens that alone are insufficient as a tourist stop name.
 * e.g. "Central area of Marripalem" should not pass.
 */
const GENERIC_AREA_PREFIXES = [
  /^central\s+(area|part|region)\s+of\s+/i,
  /^near\s+/i,
  /^area\s+around\s+/i,
  /^vicinity\s+of\s+/i,
  /^outskirts\s+of\s+/i,
  /^neighbourhood\s+of\s+/i,
  /^neighborhood\s+of\s+/i,
];

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the candidate should be hard-rejected as non-tourist.
 */
function isBlacklistedEntity(place) {
  if (!place || typeof place !== 'object') return { rejected: true, reason: 'invalid_place' };

  const name = normalizeName(place.name);
  if (!name || name.length < 2) return { rejected: true, reason: 'empty_name' };

  // Explicit known localities
  if (KNOWN_LOCALITY_NAMES.has(name)) {
    return { rejected: true, reason: 'known_locality', detail: name };
  }

  // Generic area prefixes
  for (const re of GENERIC_AREA_PREFIXES) {
    if (re.test(String(place.name || ''))) {
      return { rejected: true, reason: 'generic_area_prefix' };
    }
  }

  // Name pattern blocklist
  for (const re of LOCALITY_NAME_PATTERNS) {
    if (re.test(name)) {
      // Exception: if name also contains strong tourism tokens, defer to classifier
      // e.g. "Kailasagiri Hill Park" should not die on a weak pattern
      const hasTourismToken = /\b(beach|temple|museum|fort|palace|park|garden|viewpoint|waterfall|zoo|aquarium|monument|memorial|lighthouse|church|mosque|mandir|heritage|sanctuary|wildlife|mall|central|inorbit)\b/i.test(name);
      if (!hasTourismToken) {
        return { rejected: true, reason: 'locality_name_pattern', pattern: String(re) };
      }
    }
  }

  // OSM type / class rejection
  const osmType = String(place.osmType || place.type || place.place_type || '').toLowerCase();
  const osmClass = String(place.osmClass || place.class || place.osm_class || '').toLowerCase();

  if (REJECT_OSM_CLASSES.has(osmClass) && !isAllowedException(osmClass, osmType, name)) {
    return { rejected: true, reason: 'reject_osm_class', osmClass };
  }
  if (REJECT_OSM_TYPES.has(osmType)) {
    return { rejected: true, reason: 'reject_osm_type', osmType };
  }

  // Provider-specific locality markers
  const providerType = String(place.providerType || place.resultType || place.kind || '').toLowerCase();
  if (/\b(locality|suburb|neighbourhood|neighborhood|residential|administrative)\b/.test(providerType)) {
    return { rejected: true, reason: 'provider_locality_type', providerType };
  }

  return { rejected: false };
}

function isAllowedException(osmClass, osmType, name) {
  // Rare: historic building marked as building but with tourism name
  if (osmClass === 'building' && /\b(museum|fort|palace|temple|church|monument)\b/i.test(name)) return true;
  return false;
}

/**
 * Returns true if name looks like a pure administrative/locality label
 * with no attached attraction.
 */
function isLocalityOnlyName(name) {
  const n = normalizeName(name);
  if (!n) return true;
  if (KNOWN_LOCALITY_NAMES.has(n)) return true;
  // Short pure locality-like tokens
  if (/^(mvp|nad|vsp|rtc)\s*(colony|junction|complex)?$/.test(n)) return true;
  return LOCALITY_NAME_PATTERNS.some((re) => re.test(n) && !/\b(beach|temple|museum|fort|park|mall|garden|viewpoint)\b/i.test(n));
}

module.exports = {
  isBlacklistedEntity,
  isLocalityOnlyName,
  KNOWN_LOCALITY_NAMES,
  REJECT_OSM_TYPES,
  REJECT_OSM_CLASSES,
  LOCALITY_NAME_PATTERNS,
  normalizeName,
};
