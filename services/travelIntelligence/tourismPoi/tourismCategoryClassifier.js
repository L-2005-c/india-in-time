'use strict';

/**
 * tourismCategoryClassifier.js
 * Authoritative category classification for tourism POIs.
 * Classifies candidates into valid tourism categories or identifies non-tourist rejection types.
 */

const { isBlacklisted } = require('./tourismBlacklist');
const { isWhitelistedLandmark } = require('./tourismWhitelist');

// Authoritative Tourism Categories
const TOURISM_CATEGORIES = {
  BEACH: 'BEACH',
  SCENIC_LOCATION: 'SCENIC_LOCATION',
  VIEWPOINT: 'VIEWPOINT',
  WATERFALL: 'WATERFALL',
  PARK: 'PARK',
  GARDEN: 'GARDEN',
  MUSEUM: 'MUSEUM',
  HISTORICAL_SITE: 'HISTORICAL_SITE',
  MONUMENT: 'MONUMENT',
  FORT: 'FORT',
  HERITAGE_SITE: 'HERITAGE_SITE',
  TEMPLE: 'TEMPLE',
  RELIGIOUS_ATTRACTION: 'RELIGIOUS_ATTRACTION',
  CULTURAL_SITE: 'CULTURAL_SITE',
  WILDLIFE_NATURE: 'WILDLIFE_NATURE',
  ZOO_AQUARIUM: 'ZOO_AQUARIUM',
  SHOPPING_MALL: 'SHOPPING_MALL',
  SHOPPING_DESTINATION: 'SHOPPING_DESTINATION',
  FOOD_DESTINATION: 'FOOD_DESTINATION',
  ENTERTAINMENT: 'ENTERTAINMENT',
  NIGHTLIFE: 'NIGHTLIFE',
  FAMILY_ATTRACTION: 'FAMILY_ATTRACTION',
  ADVENTURE: 'ADVENTURE',
  PHOTOGRAPHY_SPOT: 'PHOTOGRAPHY_SPOT',
  TOURIST_ATTRACTION: 'TOURIST_ATTRACTION',
};

// Non-tourist rejection categories
const NON_TOURISM_CATEGORIES = {
  LOCALITY: 'LOCALITY',
  RESIDENTIAL_AREA: 'RESIDENTIAL_AREA',
  NEIGHBORHOOD: 'NEIGHBORHOOD',
  COLONY: 'COLONY',
  STREET: 'STREET',
  ROAD: 'ROAD',
  JUNCTION: 'JUNCTION',
  BUS_STOP: 'BUS_STOP',
  ORDINARY_BUILDING: 'ORDINARY_BUILDING',
  OFFICE: 'OFFICE',
  SCHOOL: 'SCHOOL',
  HOSPITAL: 'HOSPITAL',
  POLICE_STATION: 'POLICE_STATION',
  BANK: 'BANK',
  ATM: 'ATM',
  GENERIC_SERVICE: 'GENERIC_SERVICE',
  GENERIC_COMMERCIAL_AREA: 'GENERIC_COMMERCIAL_AREA',
  UNKNOWN_MAP_ENTITY: 'UNKNOWN_MAP_ENTITY',
};

/**
 * Classifies a place candidate into an authoritative tourism or non-tourism category.
 * @param {object} candidate - Place candidate object { name, cat, category, type, description, etc. }
 * @param {object} [context] - Context with city, provider metadata, etc.
 * @returns {{ category: string, isTourismValid: boolean, confidence: number, canonicalCategory: string }}
 */
function classifyCategory(candidate = {}, context = {}) {
  const name = String(candidate.name || '').trim();
  const lowerName = name.toLowerCase();
  const rawCat = String(candidate.cat || candidate.category || '').toLowerCase().trim();
  const osmType = String(candidate.type || candidate.osmType || candidate.placeType || '').toLowerCase().trim();

  // 0. Whitelist check takes immediate precedence
  if (isWhitelistedLandmark(name)) {
    return {
      category: TOURISM_CATEGORIES.HERITAGE_SITE,
      isTourismValid: true,
      confidence: 95,
      canonicalCategory: 'scenic',
    };
  }

  // 1. Check blacklist
  const blacklisted = isBlacklisted(name, { ...context, ...candidate });
  if (blacklisted.isBlacklisted) {
    const isCommercialOrBuilding = /complex|building|office|store|shop|hardware|clinic|hospital|school|bank|atm/i.test(name);
    return {
      category: isCommercialOrBuilding ? NON_TOURISM_CATEGORIES.GENERIC_COMMERCIAL_AREA : NON_TOURISM_CATEGORIES.LOCALITY,
      isTourismValid: false,
      confidence: 95,
      canonicalCategory: 'invalid',
      rejectionReason: blacklisted.reason,
    };
  }

  // 2. Beach
  if (rawCat === 'beach' || /\bbeach\b|\bcoast\b|\bcove\b|\bbay\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.BEACH,
      isTourismValid: true,
      confidence: 95,
      canonicalCategory: 'beach',
    };
  }

  // 3. Submarine / Aircraft / Science / History Museum
  if (rawCat === 'museum' || /\b(museum|memorial|submarine|aircraft|science\s*centre|planetarium|gallery|art\s*gallery)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.MUSEUM,
      isTourismValid: true,
      confidence: 90,
      canonicalCategory: 'museum',
    };
  }

  // 4. Fort / Palace / Heritage
  if (/\b(fort|palace|mahal|chhatri|archaeological|buddhist\s*complex|caves?|monument|tomb|minar|haveli)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.HISTORICAL_SITE,
      isTourismValid: true,
      confidence: 92,
      canonicalCategory: 'fort',
    };
  }

  // 5. Temples / Churches / Mosques / Spiritual
  if (rawCat === 'temple' || /\b(temple|mandir|dargah|church|cathedral|mosque|masjid|gurudwara|ashram|iskcon|monastery|stupa|shrine|basilica)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.TEMPLE,
      isTourismValid: true,
      confidence: 92,
      canonicalCategory: 'temple',
    };
  }

  // 6. Viewpoints / Hills / Waterfalls / Scenic
  if (/\b(viewpoint|view\s*point|hill|peak|valley|ridge|falls|waterfall|ghat|lake|dam|reservoir|promenade|lighthouse)\b/i.test(name) || candidate.is_sunset_spot || candidate.is_sunrise_spot) {
    return {
      category: TOURISM_CATEGORIES.VIEWPOINT,
      isTourismValid: true,
      confidence: 88,
      canonicalCategory: 'scenic',
    };
  }

  // 7. Zoo / Aquarium / Wildlife Sanctuary / National Park
  if (/\b(zoo|zoological|aquarium|wildlife|sanctuary|national\s*park|safari|deer\s*park|bird\s*sanctuary|bio\s*reserve)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.ZOO_AQUARIUM,
      isTourismValid: true,
      confidence: 90,
      canonicalCategory: 'scenic',
    };
  }

  // 8. Park / Garden / Botanical Garden
  if (rawCat === 'park' || rawCat === 'garden' || /\b(park|garden|botanical|vuda\s*park|tenneti\s*park|city\s*central\s*park|saheliyon)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.PARK,
      isTourismValid: true,
      confidence: 85,
      canonicalCategory: 'park',
    };
  }

  // 9. Shopping Malls / Verified Shopping Destinations / Handicrafts
  if (rawCat === 'shopping' || rawCat === 'market' || /\b(mall|shopping\s*mall|central\s*mall|inorbit|forum|nexus|phoenix|lepakshi|handicrafts?|emporium|bazaar|market|street\s*market|khadi)\b/i.test(name)) {
    const isMall = /\bmall\b|inorbit|central|forum|nexus|phoenix/i.test(name);
    return {
      category: isMall ? TOURISM_CATEGORIES.SHOPPING_MALL : TOURISM_CATEGORIES.SHOPPING_DESTINATION,
      isTourismValid: true,
      confidence: 88,
      canonicalCategory: 'shopping',
    };
  }

  // 10. Food Destinations / Iconic Restaurants / Famous Cafes / Food Streets
  if (rawCat === 'food' || rawCat === 'cafe' || /\b(restaurant|food\s*court|dhaba|bhojanalay|dining|bistro|cafe|coffee|biryani|vantillu|mess|sweet\s*house|bakers)\b/i.test(name)) {
    return {
      category: TOURISM_CATEGORIES.FOOD_DESTINATION,
      isTourismValid: true,
      confidence: 86,
      canonicalCategory: 'food',
    };
  }

  // 11. Generic Scenic
  if (rawCat === 'scenic') {
    return {
      category: TOURISM_CATEGORIES.SCENIC_LOCATION,
      isTourismValid: true,
      confidence: 75,
      canonicalCategory: 'scenic',
    };
  }

  // 12. Nominatim / Map provider hints
  if (['tourism', 'attraction', 'viewpoint', 'museum', 'theme_park', 'zoo'].includes(osmType)) {
    return {
      category: TOURISM_CATEGORIES.TOURIST_ATTRACTION,
      isTourismValid: true,
      confidence: 78,
      canonicalCategory: 'scenic',
    };
  }

  // Default: Unknown / Generic Entity with low tourism evidence
  return {
    category: NON_TOURISM_CATEGORIES.UNKNOWN_MAP_ENTITY,
    isTourismValid: false,
    confidence: 30,
    canonicalCategory: 'unknown',
    rejectionReason: 'Candidate lacks verified tourism markers or category classification',
  };
}

module.exports = {
  classifyCategory,
  TOURISM_CATEGORIES,
  NON_TOURISM_CATEGORIES,
};
