'use strict';

/**
 * services/travelIntelligence/nextJourney/destinationIntentResolver.js
 *
 * Destination Intent Model & Entity Resolution Engine (Phase 6).
 *
 * Converts traveler next-leg intent into structured candidates while
 * preserving user privacy (especially for saved HOME locations).
 */

const { distKm } = require('../../../utils/geo');
const { findGoldenPoi } = require('../../../data/goldenPoiDataset');
const appLogger = require('../../../lib/logger');

const DESTINATION_INTENTS = Object.freeze({
  RETURN_HOME: 'RETURN_HOME',
  GO_TO_HOTEL: 'GO_TO_HOTEL',
  GO_TO_RESTAURANT: 'GO_TO_RESTAURANT',
  GO_TO_AIRPORT: 'GO_TO_AIRPORT',
  GO_TO_RAILWAY_STATION: 'GO_TO_RAILWAY_STATION',
  GO_TO_BUS_STATION: 'GO_TO_BUS_STATION',
  GO_TO_PORT: 'GO_TO_PORT',
  OVERNIGHT_STAY: 'OVERNIGHT_STAY',
  CONTINUE_TO_DESTINATION: 'CONTINUE_TO_DESTINATION',
  VISIT_ANOTHER_PLACE: 'VISIT_ANOTHER_PLACE',
  CUSTOM_DESTINATION: 'CUSTOM_DESTINATION',
  END_JOURNEY: 'END_JOURNEY',
});

// Authoritative Indian transport hub seeds for major corridors
const REGIONAL_TRANSPORT_HUBS = [
  // Andhra Pradesh & Telangana
  { id: 'hub_vtz_air', name: 'Visakhapatnam International Airport (VTZ)', category: 'AIRPORT', code: 'VTZ', city: 'Visakhapatnam', lat: 17.7212, lon: 83.2245 },
  { id: 'hub_vskp_rail', name: 'Visakhapatnam Junction Railway Station (VSKP)', category: 'RAILWAY_STATION', code: 'VSKP', city: 'Visakhapatnam', lat: 17.7208, lon: 83.2842 },
  { id: 'hub_vskp_bus', name: 'Dwaraka RTC Bus Station Complex', category: 'BUS_STATION', code: 'RTC_VSKP', city: 'Visakhapatnam', lat: 17.7289, lon: 83.3051 },
  { id: 'hub_hyd_air', name: 'Rajiv Gandhi International Airport (HYD)', category: 'AIRPORT', code: 'HYD', city: 'Hyderabad', lat: 17.2403, lon: 78.4294 },
  { id: 'hub_sec_rail', name: 'Secunderabad Junction Railway Station (SC)', category: 'RAILWAY_STATION', code: 'SC', city: 'Hyderabad', lat: 17.4344, lon: 78.5017 },
  { id: 'hub_mgy_bus', name: 'Mahatma Gandhi Bus Station (MGBS)', category: 'BUS_STATION', code: 'MGBS', city: 'Hyderabad', lat: 17.3786, lon: 78.4833 },
  { id: 'hub_tir_air', name: 'Tirupati Airport (TIR)', category: 'AIRPORT', code: 'TIR', city: 'Tirupati', lat: 13.6325, lon: 79.5436 },
  { id: 'hub_tpty_rail', name: 'Tirupati Main Railway Station (TPTY)', category: 'RAILWAY_STATION', code: 'TPTY', city: 'Tirupati', lat: 13.6288, lon: 79.4192 },
  { id: 'hub_vja_air', name: 'Vijayawada Airport (VGA)', category: 'AIRPORT', code: 'VGA', city: 'Vijayawada', lat: 16.5304, lon: 80.7968 },
  { id: 'hub_bza_rail', name: 'Vijayawada Junction Railway Station (BZA)', category: 'RAILWAY_STATION', code: 'BZA', city: 'Vijayawada', lat: 16.5186, lon: 80.6200 },
  // Delhi NCR
  { id: 'hub_del_air', name: 'Indira Gandhi International Airport (DEL)', category: 'AIRPORT', code: 'DEL', city: 'Delhi', lat: 28.5562, lon: 77.1000 },
  { id: 'hub_ndls_rail', name: 'New Delhi Railway Station (NDLS)', category: 'RAILWAY_STATION', code: 'NDLS', city: 'Delhi', lat: 28.6429, lon: 77.2195 },
  { id: 'hub_isbt_bus', name: 'Maharana Pratap ISBT Kashmere Gate', category: 'BUS_STATION', code: 'ISBT_DEL', city: 'Delhi', lat: 28.6675, lon: 77.2281 },
  // Jaipur / Rajasthan
  { id: 'hub_jai_air', name: 'Jaipur International Airport (JAI)', category: 'AIRPORT', code: 'JAI', city: 'Jaipur', lat: 26.8242, lon: 75.8122 },
  { id: 'hub_jp_rail', name: 'Jaipur Junction Railway Station (JP)', category: 'RAILWAY_STATION', code: 'JP', city: 'Jaipur', lat: 26.9196, lon: 75.7878 },
  { id: 'hub_sin_bus', name: 'Sindhi Camp Central Bus Stand', category: 'BUS_STATION', code: 'SINDHI_JAI', city: 'Jaipur', lat: 26.9248, lon: 75.7981 },
];

/**
 * Resolves a destination intent into concrete candidate destination(s).
 */
async function resolveDestinationIntent({
  intentType,
  rawInput = '',
  currentLocation = null,
  userProfile = {},
  tripContext = {},
} = {}) {
  const intent = DESTINATION_INTENTS[intentType] || DESTINATION_INTENTS.CUSTOM_DESTINATION;
  const currentCoords = currentLocation ? [Number(currentLocation.lat), Number(currentLocation.lon)] : null;

  appLogger.info(`[destinationIntentResolver] Resolving intent '${intent}' (raw: '${rawInput}')`);

  switch (intent) {
    case DESTINATION_INTENTS.RETURN_HOME: {
      return resolveHomeIntent(userProfile, currentCoords);
    }

    case DESTINATION_INTENTS.GO_TO_HOTEL:
    case DESTINATION_INTENTS.OVERNIGHT_STAY: {
      return resolveHotelIntent(tripContext, currentCoords);
    }

    case DESTINATION_INTENTS.GO_TO_RESTAURANT: {
      return {
        intentType: intent,
        status: 'RESOLVED_REQUIRING_OPTIONS',
        category: 'RESTAURANT',
        destinationType: 'CORRIDOR_DINING',
        origin: currentCoords ? { lat: currentCoords[0], lon: currentCoords[1] } : null,
      };
    }

    case DESTINATION_INTENTS.GO_TO_AIRPORT:
    case DESTINATION_INTENTS.GO_TO_RAILWAY_STATION:
    case DESTINATION_INTENTS.GO_TO_BUS_STATION: {
      return resolveTransportHubIntent(intent, currentCoords);
    }

    case DESTINATION_INTENTS.CONTINUE_TO_DESTINATION:
    case DESTINATION_INTENTS.VISIT_ANOTHER_PLACE:
    case DESTINATION_INTENTS.CUSTOM_DESTINATION: {
      return resolveCustomOrOnwardDestination(rawInput, currentCoords, tripContext, intent);
    }

    case DESTINATION_INTENTS.END_JOURNEY: {
      return {
        intentType: DESTINATION_INTENTS.END_JOURNEY,
        status: 'CONCLUDED',
        message: 'Traveler elected to conclude journey.',
        candidates: [],
      };
    }

    default:
      return {
        intentType: DESTINATION_INTENTS.CUSTOM_DESTINATION,
        status: 'UNRESOLVED',
        candidates: [],
      };
  }
}

/**
 * Resolves HOME intent securely without leaking precise street addresses.
 */
function resolveHomeIntent(userProfile, currentCoords) {
  const home = userProfile?.homeLocation || userProfile?.homeDestination;

  if (!home) {
    return {
      intentType: DESTINATION_INTENTS.RETURN_HOME,
      status: 'REQUIRES_USER_INPUT',
      prompt: 'Please select or enter your home destination.',
      candidates: [],
    };
  }

  const distanceKm = (currentCoords && home.lat && home.lon)
    ? Math.round(distKm(currentCoords[0], currentCoords[1], home.lat, home.lon) * 10) / 10
    : null;

  return {
    intentType: DESTINATION_INTENTS.RETURN_HOME,
    status: 'RESOLVED',
    destination: {
      name: 'Home',
      displayName: home.city ? `Home (${home.city})` : 'Saved Home Destination',
      lat: home.lat,
      lon: home.lon,
      city: home.city || 'Home City',
      isPrivateLocation: true, // Safeguard flag
    },
    distanceKm,
    privacyNotice: 'Exact address protected and omitted from telemetry logs.',
  };
}

/**
 * Resolves HOTEL / STAY intent.
 */
function resolveHotelIntent(tripContext, currentCoords) {
  // If the active trip already has a pre-booked or designated base hotel, surface it
  if (tripContext?.activeHotel) {
    const h = tripContext.activeHotel;
    return {
      intentType: DESTINATION_INTENTS.GO_TO_HOTEL,
      status: 'RESOLVED_ACTIVE_HOTEL',
      destination: {
        id: h.id || 'active_hotel',
        name: h.name,
        category: 'HOTEL',
        lat: h.lat,
        lon: h.lon,
        city: h.city || tripContext.city,
      },
    };
  }

  // Otherwise triggers accommodation search around current location / destination corridor
  return {
    intentType: DESTINATION_INTENTS.GO_TO_HOTEL,
    status: 'RESOLVED_REQUIRING_OPTIONS',
    category: 'ACCOMMODATION',
    searchOrigin: currentCoords ? { lat: currentCoords[0], lon: currentCoords[1] } : null,
    city: tripContext?.city || null,
  };
}

/**
 * Resolves transport hubs (Airport, Rail, Bus).
 */
function resolveTransportHubIntent(intent, currentCoords) {
  const catMap = {
    GO_TO_AIRPORT: 'AIRPORT',
    GO_TO_RAILWAY_STATION: 'RAILWAY_STATION',
    GO_TO_BUS_STATION: 'BUS_STATION',
  };
  const targetCategory = catMap[intent];
  let matches = REGIONAL_TRANSPORT_HUBS.filter(h => h.category === targetCategory);

  if (currentCoords) {
    matches = matches.map(h => ({
      ...h,
      distanceKm: Math.round(distKm(currentCoords[0], currentCoords[1], h.lat, h.lon) * 10) / 10,
    })).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  const primary = matches[0] || null;

  return {
    intentType: intent,
    status: primary ? 'RESOLVED' : 'INSUFFICIENT_DATA',
    primaryDestination: primary,
    candidates: matches.slice(0, 3),
  };
}

/**
 * Resolves custom destination string or onward place name deterministically.
 */
async function resolveCustomOrOnwardDestination(rawInput, currentCoords, tripContext, targetIntent = DESTINATION_INTENTS.CUSTOM_DESTINATION) {
  const query = (rawInput || '').trim();
  if (!query) {
    return {
      intentType: targetIntent,
      status: targetIntent === DESTINATION_INTENTS.CONTINUE_TO_DESTINATION ? 'RESOLVED_REQUIRING_OPTIONS' : 'REQUIRES_USER_INPUT',
      prompt: 'Where would you like to go next?',
      candidates: [],
    };
  }

  // 1. Check verified golden dataset
  const golden = findGoldenPoi(query);
  if (golden && golden.lat && golden.lon) {
    const dist = currentCoords
      ? Math.round(distKm(currentCoords[0], currentCoords[1], golden.lat, golden.lon) * 10) / 10
      : null;

    return {
      intentType: targetIntent,
      status: 'RESOLVED',
      destination: {
        id: golden.id || `poi_${golden.name.toLowerCase().replace(/\s+/g, '_')}`,
        name: golden.name,
        category: golden.category || 'attraction',
        lat: golden.lat,
        lon: golden.lon,
        city: golden.city || tripContext?.city,
      },
      distanceKm: dist,
      source: 'VERIFIED_POI_REGISTRY',
    };
  }

  // 2. Check transport hubs by name / city
  const hubMatch = REGIONAL_TRANSPORT_HUBS.find(h =>
    h.name.toLowerCase().includes(query.toLowerCase()) ||
    (h.code && h.code.toLowerCase() === query.toLowerCase())
  );
  if (hubMatch) {
    return {
      intentType: targetIntent,
      status: 'RESOLVED',
      destination: hubMatch,
      source: 'TRANSPORT_HUB_REGISTRY',
    };
  }

  // 3. Fallback: Return unresolved with disambiguation prompt
  return {
    intentType: targetIntent,
    status: 'AMBIGUOUS',
    query,
    message: `Could not deterministically verify '${query}'. Please confirm location.`,
    candidates: [
      { name: `${query} (Central)`, lat: currentCoords ? currentCoords[0] + 0.05 : 17.7, lon: currentCoords ? currentCoords[1] + 0.05 : 83.3 },
    ],
  };
}

module.exports = {
  DESTINATION_INTENTS,
  REGIONAL_TRANSPORT_HUBS,
  resolveDestinationIntent,
  resolveHomeIntent,
  resolveHotelIntent,
  resolveTransportHubIntent,
  resolveCustomOrOnwardDestination,
};
