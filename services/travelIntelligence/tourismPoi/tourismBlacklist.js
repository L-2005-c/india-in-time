'use strict';

/**
 * Conservative negative taxonomy for map/geocoder noise.
 * These are rejected as tourist stops unless an explicit, verified
 * attraction signal is present.
 */
const TYPE_REJECTS = new Set([
  'locality', 'neighborhood', 'suburb', 'residential', 'administrative',
  'street', 'road', 'junction', 'bus_stop', 'bus_station', 'railway_station',
  'office', 'hospital', 'school', 'university', 'government', 'police',
  'bank', 'atm', 'post_office', 'generic_service', 'commercial',
  'generic_commercial_area', 'building', 'house', 'parking', 'fuel',
]);

const NAME_PATTERNS = [
  /\b(?:locality|neighborhood|colony|residential area|housing colony)\b/i,
  /\b(?:junction|crossroads|cross road|signal|circle)\b/i,
  /\b(?:bus stop|bus station|railway station|metro station)\b/i,
  /\b(?:government office|collectorate|police station|post office)\b/i,
];

const KNOWN_LOCALITY_NAMES = new Set([
  'marripalem', 'seethammadhara', 'dwaraka nagar', 'dwaraka-nagar', 'mvp colony',
  'akkayyapalem', 'maddilapalem', 'gajuwaka', 'madhurawada', 'nad junction',
  'nad', 'salagramapuram', 'dondaparthi', 'kancharapalem', 'gopalapatnam',
  'pendurthi', 'kurmannapalem', 'sheela nagar', 'rushikonda locality',
]);

const TOURISM_NAME_SIGNALS = [
  /\bbeach\b/i, /\bmuseum\b/i, /\bfort\b/i, /\bpalace\b/i, /\bmonument\b/i,
  /\bmemorial\b/i, /\blighthouse\b/i, /\bview\s*point\b/i, /\bviewpoint\b/i,
  /\bwaterfall\b/i, /\bzoo\b/i, /\baquarium\b/i, /\bsanctuary\b/i,
  /\bwildlife\b/i, /\bbotanical\b/i, /\bgarden\b/i, /\bpark\b/i,
  /\bheritage\b/i, /\btemple\b/i, /\bchurch\b/i, /\bmosque\b/i,
  /\bgurudwara\b/i, /\bmonastery\b/i, /\bmall\b/i,
];

function looksLikeRejectedName(name = '') {
  const normalized = String(name).toLowerCase().trim().replace(/\\s+/g, ' ');
  return KNOWN_LOCALITY_NAMES.has(normalized) || NAME_PATTERNS.some((rx) => rx.test(String(name)));
}

function hasTourismNameSignal(name = '') {
  return TOURISM_NAME_SIGNALS.some((rx) => rx.test(String(name)));
}

module.exports = { TYPE_REJECTS, KNOWN_LOCALITY_NAMES, looksLikeRejectedName, hasTourismNameSignal };
