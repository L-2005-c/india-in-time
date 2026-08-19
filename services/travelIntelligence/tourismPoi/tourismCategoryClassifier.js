'use strict';

/**
 * Tourism Category Classifier
 *
 * Maps a candidate place into a canonical tourism class or REJECT.
 * Classes align with the product taxonomy in the upgrade specification.
 */

const TOURISM_CLASSES = Object.freeze({
  TOURIST_ATTRACTION: 'TOURIST_ATTRACTION',
  CULTURAL_SITE: 'CULTURAL_SITE',
  TEMPLE: 'TEMPLE',
  RELIGIOUS_ATTRACTION: 'RELIGIOUS_ATTRACTION',
  SCENIC_LOCATION: 'SCENIC_LOCATION',
  VIEWPOINT: 'VIEWPOINT',
  BEACH: 'BEACH',
  WATERFALL: 'WATERFALL',
  PARK: 'PARK',
  GARDEN: 'GARDEN',
  MUSEUM: 'MUSEUM',
  HISTORICAL_SITE: 'HISTORICAL_SITE',
  MONUMENT: 'MONUMENT',
  FORT: 'FORT',
  PALACE: 'PALACE',
  HERITAGE_SITE: 'HERITAGE_SITE',
  WILDLIFE: 'WILDLIFE',
  NATURE: 'NATURE',
  ZOO: 'ZOO',
  AQUARIUM: 'AQUARIUM',
  SHOPPING_MALL: 'SHOPPING_MALL',
  SHOPPING_DESTINATION: 'SHOPPING_DESTINATION',
  FOOD_DESTINATION: 'FOOD_DESTINATION',
  ENTERTAINMENT: 'ENTERTAINMENT',
  NIGHTLIFE: 'NIGHTLIFE',
  FAMILY_ATTRACTION: 'FAMILY_ATTRACTION',
  ADVENTURE: 'ADVENTURE',
  PHOTOGRAPHY_SPOT: 'PHOTOGRAPHY_SPOT',
  // Reject classes
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
});

const REJECT_CLASSES = new Set([
  TOURISM_CLASSES.LOCALITY,
  TOURISM_CLASSES.RESIDENTIAL_AREA,
  TOURISM_CLASSES.NEIGHBORHOOD,
  TOURISM_CLASSES.COLONY,
  TOURISM_CLASSES.STREET,
  TOURISM_CLASSES.ROAD,
  TOURISM_CLASSES.JUNCTION,
  TOURISM_CLASSES.BUS_STOP,
  TOURISM_CLASSES.ORDINARY_BUILDING,
  TOURISM_CLASSES.OFFICE,
  TOURISM_CLASSES.SCHOOL,
  TOURISM_CLASSES.HOSPITAL,
  TOURISM_CLASSES.POLICE_STATION,
  TOURISM_CLASSES.BANK,
  TOURISM_CLASSES.ATM,
  TOURISM_CLASSES.GENERIC_SERVICE,
  TOURISM_CLASSES.GENERIC_COMMERCIAL_AREA,
  TOURISM_CLASSES.UNKNOWN_MAP_ENTITY,
]);

/** Map internal product categories → tourism class */
const PRODUCT_CAT_TO_CLASS = {
  beach: TOURISM_CLASSES.BEACH,
  temple: TOURISM_CLASSES.TEMPLE,
  scenic: TOURISM_CLASSES.SCENIC_LOCATION,
  food: TOURISM_CLASSES.FOOD_DESTINATION,
  museum: TOURISM_CLASSES.MUSEUM,
  park: TOURISM_CLASSES.PARK,
  market: TOURISM_CLASSES.SHOPPING_DESTINATION,
  shopping: TOURISM_CLASSES.SHOPPING_MALL,
  nightlife: TOURISM_CLASSES.NIGHTLIFE,
  cafe: TOURISM_CLASSES.FOOD_DESTINATION,
  heritage: TOURISM_CLASSES.HERITAGE_SITE,
  monument: TOURISM_CLASSES.MONUMENT,
  zoo: TOURISM_CLASSES.ZOO,
  aquarium: TOURISM_CLASSES.AQUARIUM,
  wildlife: TOURISM_CLASSES.WILDLIFE,
  viewpoint: TOURISM_CLASSES.VIEWPOINT,
  adventure: TOURISM_CLASSES.ADVENTURE,
  entertainment: TOURISM_CLASSES.ENTERTAINMENT,
};

/** OSM type → tourism class */
const OSM_TYPE_TO_CLASS = {
  attraction: TOURISM_CLASSES.TOURIST_ATTRACTION,
  viewpoint: TOURISM_CLASSES.VIEWPOINT,
  museum: TOURISM_CLASSES.MUSEUM,
  gallery: TOURISM_CLASSES.CULTURAL_SITE,
  artwork: TOURISM_CLASSES.CULTURAL_SITE,
  theme_park: TOURISM_CLASSES.ENTERTAINMENT,
  zoo: TOURISM_CLASSES.ZOO,
  aquarium: TOURISM_CLASSES.AQUARIUM,
  picnic_site: TOURISM_CLASSES.PARK,
  restaurant: TOURISM_CLASSES.FOOD_DESTINATION,
  cafe: TOURISM_CLASSES.FOOD_DESTINATION,
  fast_food: TOURISM_CLASSES.FOOD_DESTINATION,
  food_court: TOURISM_CLASSES.FOOD_DESTINATION,
  marketplace: TOURISM_CLASSES.SHOPPING_DESTINATION,
  place_of_worship: TOURISM_CLASSES.RELIGIOUS_ATTRACTION,
  cinema: TOURISM_CLASSES.ENTERTAINMENT,
  arts_centre: TOURISM_CLASSES.CULTURAL_SITE,
  park: TOURISM_CLASSES.PARK,
  garden: TOURISM_CLASSES.GARDEN,
  nature_reserve: TOURISM_CLASSES.NATURE,
  beach_resort: TOURISM_CLASSES.BEACH,
  monument: TOURISM_CLASSES.MONUMENT,
  memorial: TOURISM_CLASSES.MONUMENT,
  castle: TOURISM_CLASSES.FORT,
  ruins: TOURISM_CLASSES.HISTORICAL_SITE,
  fort: TOURISM_CLASSES.FORT,
  archaeological_site: TOURISM_CLASSES.HERITAGE_SITE,
  church: TOURISM_CLASSES.RELIGIOUS_ATTRACTION,
  mosque: TOURISM_CLASSES.RELIGIOUS_ATTRACTION,
  temple: TOURISM_CLASSES.TEMPLE,
  shrine: TOURISM_CLASSES.RELIGIOUS_ATTRACTION,
  beach: TOURISM_CLASSES.BEACH,
  cliff: TOURISM_CLASSES.SCENIC_LOCATION,
  peak: TOURISM_CLASSES.VIEWPOINT,
  waterfall: TOURISM_CLASSES.WATERFALL,
  cave_entrance: TOURISM_CLASSES.ADVENTURE,
  hot_spring: TOURISM_CLASSES.NATURE,
};

const NAME_RULES = [
  { re: /\bbeach\b|\bbay\b/i, cls: TOURISM_CLASSES.BEACH },
  { re: /\btemple\b|\bmandir\b|\biskcon\b/i, cls: TOURISM_CLASSES.TEMPLE },
  { re: /\bchurch\b|\bcathedral\b|\bmosque\b|\bgurudwara\b/i, cls: TOURISM_CLASSES.RELIGIOUS_ATTRACTION },
  { re: /\bmuseum\b/i, cls: TOURISM_CLASSES.MUSEUM },
  { re: /\baquarium\b/i, cls: TOURISM_CLASSES.AQUARIUM },
  { re: /\bzoo\b/i, cls: TOURISM_CLASSES.ZOO },
  { re: /\bfort\b|\bqila\b/i, cls: TOURISM_CLASSES.FORT },
  { re: /\bpalace\b/i, cls: TOURISM_CLASSES.PALACE },
  { re: /\bmonument\b|\bmemorial\b/i, cls: TOURISM_CLASSES.MONUMENT },
  { re: /\bheritage\b|\bruins\b|\barchaeological\b/i, cls: TOURISM_CLASSES.HERITAGE_SITE },
  { re: /\bwaterfall\b|\bfalls\b/i, cls: TOURISM_CLASSES.WATERFALL },
  { re: /\bviewpoint\b|\bview\s*point\b|\blighthouse\b/i, cls: TOURISM_CLASSES.VIEWPOINT },
  { re: /\bpark\b|\bgarden\b/i, cls: TOURISM_CLASSES.PARK },
  { re: /\bsanctuary\b|\bwildlife\b|\bnational\s*park\b/i, cls: TOURISM_CLASSES.WILDLIFE },
  { re: /\bmall\b|\bshopping\s*centre\b|\bshopping\s*center\b/i, cls: TOURISM_CLASSES.SHOPPING_MALL },
  { re: /\bmarket\b|\bbazaar\b|\bhaat\b/i, cls: TOURISM_CLASSES.SHOPPING_DESTINATION },
  { re: /\brestaurant\b|\bcafe\b|\bdhaba\b|\bfood\s*court\b|\bkitchen\b/i, cls: TOURISM_CLASSES.FOOD_DESTINATION },
  { re: /\bnagar\b|\bcolony\b|\blayout\b|\bsector\b/i, cls: TOURISM_CLASSES.LOCALITY },
  { re: /\bjunction\b|\bcircle\b|\bcross\b/i, cls: TOURISM_CLASSES.JUNCTION },
  { re: /\broad\b|\bstreet\b|\bhighway\b/i, cls: TOURISM_CLASSES.ROAD },
  { re: /\bbus\s*stop\b|\bbus\s*stand\b/i, cls: TOURISM_CLASSES.BUS_STOP },
  { re: /\bhospital\b|\bclinic\b/i, cls: TOURISM_CLASSES.HOSPITAL },
  { re: /\bschool\b|\bcollege\b|\buniversity\b/i, cls: TOURISM_CLASSES.SCHOOL },
  { re: /\bpolice\b/i, cls: TOURISM_CLASSES.POLICE_STATION },
];

/**
 * Classify a place into a tourism class.
 * @returns {{ class: string, confidence: number, isTourist: boolean, source: string }}
 */
function classifyTourismCategory(place) {
  if (!place || typeof place !== 'object') {
    return { class: TOURISM_CLASSES.UNKNOWN_MAP_ENTITY, confidence: 0, isTourist: false, source: 'invalid' };
  }

  const name = String(place.name || '');
  const productCat = String(place.cat || place.category || '').toLowerCase().trim();
  const osmType = String(place.osmType || place.type || '').toLowerCase();
  const osmClass = String(place.osmClass || place.class || '').toLowerCase();

  // 1. Explicit product category
  if (productCat && PRODUCT_CAT_TO_CLASS[productCat]) {
    const cls = PRODUCT_CAT_TO_CLASS[productCat];
    return {
      class: cls,
      confidence: 0.9,
      isTourist: !REJECT_CLASSES.has(cls),
      source: 'product_category',
    };
  }

  // 2. OSM type
  if (osmType && OSM_TYPE_TO_CLASS[osmType]) {
    const cls = OSM_TYPE_TO_CLASS[osmType];
    return {
      class: cls,
      confidence: 0.85,
      isTourist: !REJECT_CLASSES.has(cls),
      source: 'osm_type',
    };
  }

  // 3. Name heuristics (ordered; first match wins)
  for (const rule of NAME_RULES) {
    if (rule.re.test(name)) {
      return {
        class: rule.cls,
        confidence: 0.7,
        isTourist: !REJECT_CLASSES.has(rule.cls),
        source: 'name_heuristic',
      };
    }
  }

  // 4. OSM class-level fallbacks
  if (osmClass === 'tourism') {
    return { class: TOURISM_CLASSES.TOURIST_ATTRACTION, confidence: 0.6, isTourist: true, source: 'osm_class' };
  }
  if (osmClass === 'historic') {
    return { class: TOURISM_CLASSES.HISTORICAL_SITE, confidence: 0.6, isTourist: true, source: 'osm_class' };
  }
  if (osmClass === 'leisure') {
    return { class: TOURISM_CLASSES.PARK, confidence: 0.5, isTourist: true, source: 'osm_class' };
  }
  if (osmClass === 'amenity' && /restaurant|cafe|food/.test(osmType || name)) {
    return { class: TOURISM_CLASSES.FOOD_DESTINATION, confidence: 0.55, isTourist: true, source: 'osm_class' };
  }

  // 5. Whitelist-resolved category
  if (place._whitelistCategory) {
    const cls = PRODUCT_CAT_TO_CLASS[place._whitelistCategory] || TOURISM_CLASSES.TOURIST_ATTRACTION;
    return { class: cls, confidence: 0.95, isTourist: true, source: 'whitelist' };
  }

  return {
    class: TOURISM_CLASSES.UNKNOWN_MAP_ENTITY,
    confidence: 0.2,
    isTourist: false,
    source: 'unknown',
  };
}

function isRejectClass(cls) {
  return REJECT_CLASSES.has(cls);
}

/** Map tourism class → product category used by the rest of the engine */
function toProductCategory(tourismClass) {
  const map = {
    [TOURISM_CLASSES.BEACH]: 'beach',
    [TOURISM_CLASSES.TEMPLE]: 'temple',
    [TOURISM_CLASSES.RELIGIOUS_ATTRACTION]: 'temple',
    [TOURISM_CLASSES.SCENIC_LOCATION]: 'scenic',
    [TOURISM_CLASSES.VIEWPOINT]: 'scenic',
    [TOURISM_CLASSES.PHOTOGRAPHY_SPOT]: 'scenic',
    [TOURISM_CLASSES.MUSEUM]: 'museum',
    [TOURISM_CLASSES.HISTORICAL_SITE]: 'museum',
    [TOURISM_CLASSES.MONUMENT]: 'museum',
    [TOURISM_CLASSES.FORT]: 'museum',
    [TOURISM_CLASSES.PALACE]: 'museum',
    [TOURISM_CLASSES.HERITAGE_SITE]: 'museum',
    [TOURISM_CLASSES.CULTURAL_SITE]: 'museum',
    [TOURISM_CLASSES.PARK]: 'park',
    [TOURISM_CLASSES.GARDEN]: 'park',
    [TOURISM_CLASSES.WILDLIFE]: 'park',
    [TOURISM_CLASSES.NATURE]: 'park',
    [TOURISM_CLASSES.ZOO]: 'park',
    [TOURISM_CLASSES.AQUARIUM]: 'museum',
    [TOURISM_CLASSES.WATERFALL]: 'scenic',
    [TOURISM_CLASSES.SHOPPING_MALL]: 'shopping',
    [TOURISM_CLASSES.SHOPPING_DESTINATION]: 'shopping',
    [TOURISM_CLASSES.FOOD_DESTINATION]: 'food',
    [TOURISM_CLASSES.ENTERTAINMENT]: 'entertainment',
    [TOURISM_CLASSES.NIGHTLIFE]: 'nightlife',
    [TOURISM_CLASSES.FAMILY_ATTRACTION]: 'scenic',
    [TOURISM_CLASSES.ADVENTURE]: 'scenic',
    [TOURISM_CLASSES.TOURIST_ATTRACTION]: 'scenic',
  };
  return map[tourismClass] || null;
}

module.exports = {
  TOURISM_CLASSES,
  REJECT_CLASSES,
  classifyTourismCategory,
  isRejectClass,
  toProductCategory,
};
