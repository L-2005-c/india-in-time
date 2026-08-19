'use strict';

/**
 * tourismBlacklist.js
 * Comprehensive rejection dictionary and regex patterns for non-tourist geographic entities,
 * residential localities, administrative zones, generic infrastructure, commercial offices,
 * clinics, schools, banks, ATMs, and city-specific neighbourhood names.
 *
 * A geographic entity existing on a map does NOT make it a tourist attraction.
 */

// Universal non-tourist keywords and patterns
const NON_TOURIST_KEYWORDS = [
  'colony', 'residential colony', 'housing colony', 'layout', 'enclave', 'nagar',
  'locality', 'suburb', 'neighbourhood', 'neighborhood', 'residential area',
  'sector', 'block', 'phase', 'ward', 'zone', 'village', 'mandal', 'panchayat',
  'junction', 'chowk', 'circle', 'cross', 'cross road', 'flyover', 'signal',
  'road', 'street', 'lane', 'gali', 'marg', 'rasta', 'highway', 'bypass',
  'bus stop', 'bus stand', 'bus depot', 'bus terminal', 'auto stand', 'taxi stand',
  'railway station', 'metro station', 'train station',
  'hospital', 'clinic', 'nursing home', 'pharmacy', 'medical store', 'diagnostic',
  'school', 'high school', 'public school', 'college', 'junior college', 'degree college',
  'university', 'institute', 'academy', 'coaching centre', 'hostel', 'pg hostel',
  'office', 'corporate office', 'branch office', 'head office', 'bpo', 'it park',
  'police station', 'police outpost', 'ps', 'traffic ps', 'station',
  'bank', 'atm', 'branch', 'sub-post office', 'post office',
  'government office', 'mdo office', 'mro office', 'tehsildar', 'sub-registrar',
  'court', 'collectorate', 'secretariat', 'municipal corporation', 'municipality',
  'graveyard', 'crematorium', 'burial ground', 'dump yard', 'substation',
  'petrol pump', 'petrol bunk', 'fuel station', 'gas station', 'service station',
  'apartment', 'apartments', 'residency', 'towers', 'heights', 'villas', 'estates',
  'car wash', 'garage', 'mechanic', 'tyre shop', 'tailor', 'laundry', 'salon',
  'xerox', 'stationery', 'hardware store', 'timber depot', 'iron store',
];

// Specific known locality/residential area names by city that map providers frequently return as places
const CITY_SPECIFIC_LOCALITIES = {
  visakhapatnam: [
    'marripalem', 'seethammadhara', 'dwaraka nagar', 'dwarakanagar', 'gajuwaka',
    'madhurawada', 'mvp colony', 'siripuram', 'pendurthi', 'akkayyapalem',
    'kurmannapalem', 'nad junction', 'nad kotha road', 'maddilapalem', 'jagadamba junction',
    'asirvada puram', 'kancharapalem', 'muralinagar', 'isukathota', 'venkojipalem',
    'pedda waltair', 'chinna waltair', 'waltair uplands', 'maharanipeta', 'allipuram',
    'poorva market', 'dabagardens', 'daba gardens', 'suryabagh', 'ramnagar',
    'resapuvanipalem', 'arilova', 'hanumanthawaka', 'scindia', 'mindi',
    'auto nagar', 'sheela nagar', 'steel plant township', 'ukkunagaram', 'desapatrunipalem',
    'kanithi', 'vadlapudi', 'anakapalle', 'chittivalasa', 'tagarapuvalasa',
  ],
  vizag: [
    'marripalem', 'seethammadhara', 'dwaraka nagar', 'dwarakanagar', 'gajuwaka',
    'madhurawada', 'mvp colony', 'siripuram', 'pendurthi', 'akkayyapalem',
    'kurmannapalem', 'nad junction', 'nad kotha road', 'maddilapalem', 'jagadamba junction',
    'asirvada puram', 'kancharapalem', 'muralinagar', 'isukathota', 'venkojipalem',
    'pedda waltair', 'chinna waltair', 'waltair uplands', 'maharanipeta', 'allipuram',
    'poorva market', 'dabagardens', 'daba gardens', 'suryabagh', 'ramnagar',
    'resapuvanipalem', 'arilova', 'hanumanthawaka', 'scindia', 'mindi',
    'auto nagar', 'sheela nagar', 'steel plant township', 'ukkunagaram', 'desapatrunipalem',
    'kanithi', 'vadlapudi', 'anakapalle', 'chittivalasa', 'tagarapuvalasa',
  ],
  hyderabad: [
    'kukatpally', 'ameerpet', 'dilsukhnagar', 'madhapur', 'gachibowli', 'kondapur',
    'kothapet', 'lb nagar', 'uppal', 'tarnaka', 'secunderabad', 'begumpet',
    'panjagutta', 'somajiguda', 'sr nagar', 'sanath nagar', 'miyapur', 'nizampet',
    'chandanagar', 'hitec city', 'jubilee hills', 'banjara hills', 'mehdipatnam',
    'tolichowki', 'attapur', 'rajendranagar', 'shamshabad', 'malakpet', 'amberpet',
  ],
  delhi: [
    'rohini', 'dwarka', 'janakpuri', 'pitampura', 'patel nagar', 'lajpat nagar',
    'karol bagh', 'saket', 'vasant kunj', 'uttam nagar', 'laxmi nagar',
    'shahdara', 'mayur vihar', 'paschim vihar', 'tilak nagar', 'rajouri garden',
  ],
  mumbai: [
    'andheri', 'borivali', 'kandivali', 'malad', 'goregaon', 'jogeshwari',
    'vile parle', 'santacruz', 'khar', 'bandra', 'dadar', 'kurla',
    'ghatkopar', 'bhandup', 'mulund', 'thane', 'vashi', 'nerul', 'belapur',
  ],
  bengaluru: [
    'koramangala', 'indiranagar', 'whitefield', 'electronic city', 'hsr layout',
    'btm layout', 'jayanagar', 'jp nagar', 'marathahalli', 'bellandur',
    'hebbal', 'banashankari', 'malleswaram', 'rajajinagar', 'yelahanka',
  ],
};

// Regex patterns to identify non-tourist POIs by name
const NON_TOURIST_REGEX_PATTERNS = [
  /\b(colony|nagar|layout|enclave|society|apartments?|residency|residential(\s*area|\s*block)?|block|sector|phase|towers?|villas?)\b/i,
  /\b(junction|circle|chowk|cross\s*roads?|flyover|signal)\b/i,
  /\b(hospital|clinic|nursing\s*home|dispensary|diagnostic|pharmacy|chemist)\b/i,
  /\b(school|vidyalaya|academy|college|university|institute\s*of\s*technology)\b/i,
  /\b(police\s*station|traffic\s*ps|chowki|outpost)\b/i,
  /\b(bank|atm|branch|post\s*office|sub\s*post)\b/i,
  /\b(bus\s*stand|bus\s*stop|bus\s*depot|auto\s*stand|metro\s*station)\b/i,
  /\b(petrol\s*bunk|petrol\s*pump|gas\s*station|cng\s*station)\b/i,
  /\b(office|corporation|complex|bhavan|bhavanam)\b/i,
  /\b(store|shop|tailor|xerox|laundry|saloon|salon|hardware|timber)\b/i,
];

// OpenStreetMap / Nominatim / Map provider type blacklist
const MAP_PROVIDER_TYPE_BLACKLIST = new Set([
  'administrative', 'suburb', 'neighbourhood', 'neighborhood', 'locality', 'residential',
  'city_block', 'quarter', 'hamlet', 'village', 'town', 'county', 'district',
  'highway', 'road', 'street', 'junction', 'roundabout', 'traffic_signals', 'bus_stop',
  'railway', 'station', 'platform', 'subway_entrance', 'parking', 'fuel',
  'hospital', 'clinic', 'doctors', 'dentist', 'pharmacy',
  'school', 'college', 'university', 'kindergarten',
  'police', 'fire_station', 'post_office', 'bank', 'atm', 'courthouse', 'townhall',
  'office', 'commercial', 'industrial', 'residential_zone', 'construction',
  'apartments', 'house', 'detached', 'residential_building',
]);

/**
 * Checks if a candidate name or type matches the non-tourist blacklist.
 * @param {string} name - Place candidate name
 * @param {object} [metadata] - Optional metadata (city, osmType, osmCategory, placeType)
 * @returns {{ isBlacklisted: boolean, reason: string|null }}
 */
function isBlacklisted(name, metadata = {}) {
  const cleanName = String(name || '').trim().toLowerCase();
  if (!cleanName || cleanName.length < 2) {
    return { isBlacklisted: true, reason: 'Invalid or empty place name' };
  }

  const city = String(metadata.city || metadata.cityName || '').trim().toLowerCase();

  // 1. Check exact or direct city-specific locality names
  const cityLocalities = (city && CITY_SPECIFIC_LOCALITIES[city]) || [];
  const allKnownLocalities = Object.values(CITY_SPECIFIC_LOCALITIES).flat();
  const searchLocalities = cityLocalities.length ? cityLocalities : allKnownLocalities;

  for (const loc of searchLocalities) {
    if (cleanName === loc || cleanName === `${loc} area` || cleanName === `near ${loc}` || cleanName.startsWith(`${loc},`)) {
      return { isBlacklisted: true, reason: `Exact match for known residential/geographic locality: "${loc}"` };
    }
  }

  // 2. Check OSM / Nominatim provider types
  const osmType = String(metadata.type || metadata.osmType || metadata.placeType || '').toLowerCase();
  const osmClass = String(metadata.class || metadata.osmCategory || '').toLowerCase();

  if (MAP_PROVIDER_TYPE_BLACKLIST.has(osmType)) {
    return { isBlacklisted: true, reason: `Map provider entity type is non-tourist: "${osmType}"` };
  }
  if (['highway', 'boundary', 'place', 'landuse', 'office', 'emergency'].includes(osmClass)) {
    return { isBlacklisted: true, reason: `Map provider entity class is non-tourist: "${osmClass}"` };
  }

  // 3. Check for specific non-tourist structural patterns unless it has clear tourism markers
  const hasTourismMarker = /beach|museum|submarine|temple|church|mosque|fort|palace|viewpoint|wildlife|sanctuary|aquarium|waterfall|garden|park|memorial|lighthouse|mall|resort/i.test(cleanName);
  
  if (!hasTourismMarker) {
    for (const pattern of NON_TOURIST_REGEX_PATTERNS) {
      if (pattern.test(cleanName)) {
        return { isBlacklisted: true, reason: `Name pattern indicates non-tourist entity: "${cleanName}"` };
      }
    }
  }

  return { isBlacklisted: false, reason: null };
}

module.exports = {
  isBlacklisted,
  NON_TOURIST_KEYWORDS,
  CITY_SPECIFIC_LOCALITIES,
  MAP_PROVIDER_TYPE_BLACKLIST,
};
