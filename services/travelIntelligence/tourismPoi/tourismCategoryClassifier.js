'use strict';

const { normalizeCat } = require('../requirementEngine');

const CLASS_BY_CATEGORY = {
  beach: 'BEACH',
  scenic: 'SCENIC_LOCATION',
  viewpoint: 'VIEWPOINT',
  waterfall: 'WATERFALL',
  park: 'PARK_GARDEN',
  garden: 'PARK_GARDEN',
  museum: 'MUSEUM',
  temple: 'TEMPLE_RELIGIOUS_ATTRACTION',
  church: 'TEMPLE_RELIGIOUS_ATTRACTION',
  mosque: 'TEMPLE_RELIGIOUS_ATTRACTION',
  fort: 'FORT_PALACE',
  palace: 'FORT_PALACE',
  monument: 'MONUMENT',
  heritage: 'HERITAGE_SITE',
  wildlife: 'WILDLIFE_NATURE',
  zoo: 'ZOO_AQUARIUM',
  aquarium: 'ZOO_AQUARIUM',
  food: 'FOOD_DESTINATION',
  cafe: 'FOOD_DESTINATION',
  shopping: 'SHOPPING_DESTINATION',
  mall: 'SHOPPING_DESTINATION',
  entertainment: 'ENTERTAINMENT',
  nightlife: 'NIGHTLIFE',
  family: 'FAMILY_ATTRACTION',
  adventure: 'ADVENTURE',
  photography: 'PHOTOGRAPHY_SPOT',
};

function classifyTourismCandidate(place = {}) {
  const explicit = String(place.tourismClass || place.tourismType || '').trim().toUpperCase();
  if (explicit) return explicit;

  const rawType = String(
    place.placeType || place.place_type || place.osmType || place.providerType ||
    place.type || place.types?.[0] || '',
  ).toLowerCase();

  const cat = normalizeCat(place.cat || place.category);
  if (CLASS_BY_CATEGORY[cat]) return CLASS_BY_CATEGORY[cat];

  if (/tourist_attraction|attraction|landmark/.test(rawType)) return 'TOURIST_ATTRACTION';
  if (/shopping_mall|mall|shopping/.test(rawType)) return 'SHOPPING_DESTINATION';
  if (/restaurant|food|cafe|dining/.test(rawType)) return 'FOOD_DESTINATION';
  if (/museum/.test(rawType)) return 'MUSEUM';
  if (/temple|church|mosque|gurudwara|religious/.test(rawType)) return 'TEMPLE_RELIGIOUS_ATTRACTION';
  if (/beach/.test(rawType)) return 'BEACH';
  if (/park|garden/.test(rawType)) return 'PARK_GARDEN';
  if (/viewpoint|scenic/.test(rawType)) return 'VIEWPOINT';
  if (/monument/.test(rawType)) return 'MONUMENT';
  if (/fort|palace/.test(rawType)) return 'FORT_PALACE';
  if (/heritage/.test(rawType)) return 'HERITAGE_SITE';
  if (/wildlife|nature|sanctuary/.test(rawType)) return 'WILDLIFE_NATURE';

  return 'UNKNOWN_MAP_ENTITY';
}

module.exports = { classifyTourismCandidate };
