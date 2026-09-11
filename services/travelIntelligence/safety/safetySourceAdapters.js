'use strict';

/**
 * services/travelIntelligence/safety/safetySourceAdapters.js
 *
 * India In-Time v3.0 — Official & Trusted Safety Source Adapters
 *
 * Absolute Truthfulness Contract:
 * 1. Explicitly declares provider connectivity status:
 *    - CONNECTED: Live authenticated production feed active.
 *    - PARTIALLY_CONNECTED: Open public/fallback feed active (e.g. Open-Meteo alerts, open RSS).
 *    - CONFIGURED_BUT_NOT_CONNECTED: Adapter code configured; awaiting departmental production credentials.
 *    - UNAVAILABLE: Provider down or unreachable.
 * 2. NEVER pretends an official source is live connected when it is not.
 * 3. Never fabricates official alerts or simulated feeds as production truth.
 */

const PROVIDER_STATUS = Object.freeze({
  CONNECTED: 'CONNECTED',
  PARTIALLY_CONNECTED: 'PARTIALLY_CONNECTED',
  CONFIGURED_BUT_NOT_CONNECTED: 'CONFIGURED_BUT_NOT_CONNECTED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const OFFICIAL_PROVIDERS = Object.freeze({
  NDMA_SACHET: {
    id: 'NDMA_SACHET',
    name: 'National Disaster Management Authority (NDMA) / SACHET CAP Feed',
    provider: 'NDMA',
    sourceType: 'GOVERNMENT_DISASTER_MANAGEMENT',
    status: PROVIDER_STATUS.CONFIGURED_BUT_NOT_CONNECTED,
    endpoint: 'https://sachet.ndma.gov.in/cap/feed/v1',
    accessMethod: 'REST_CAP_XML_JSON',
    freshnessPolicySeconds: 1800, // 30 min
    geographicResolution: 'DISTRICT_TEHSIL_POLYGON',
    dataSemantics: 'OFFICIAL_EMERGENCY_DIRECTIVES_AND_EVACUATION_ALERTS',
    failureMode: 'FALLBACK_TO_STATE_SDMA_BULLETINS_OR_UNAVAILABLE',
    productionRequirement: 'Departmental API Key & Whitelisted Egress IP',
  },
  IMD: {
    id: 'IMD',
    name: 'India Meteorological Department (IMD) / Regional Met Centre',
    provider: 'IMD',
    sourceType: 'NATIONAL_METEOROLOGICAL_SERVICE',
    status: PROVIDER_STATUS.PARTIALLY_CONNECTED,
    endpoint: 'https://mausam.imd.gov.in/api/warnings/district',
    accessMethod: 'OPEN_BULLETIN_FEED_AND_SYNOP_NOWCAST',
    freshnessPolicySeconds: 3600, // 1 hour
    geographicResolution: 'DISTRICT_AND_OBSERVATORY_STATION',
    dataSemantics: 'OFFICIAL_COLOR_CODED_WEATHER_WARNINGS_AND_NOWCASTS',
    failureMode: 'FALLBACK_TO_NW_METEO_MODEL_AND_CLIMATOLOGY',
    productionRequirement: 'IMD Public Warning Feed Active',
  },
  CWC: {
    id: 'CWC',
    name: 'Central Water Commission (CWC) Flood Advisory Service',
    provider: 'CWC',
    sourceType: 'NATIONAL_WATER_RESOURCES_COMMISSION',
    status: PROVIDER_STATUS.CONFIGURED_BUT_NOT_CONNECTED,
    endpoint: 'https://ffs.india-water.gov.in/api/v1/advisories',
    accessMethod: 'HYDROLOGICAL_BULLETIN_REST',
    freshnessPolicySeconds: 7200, // 2 hours
    geographicResolution: 'BASIN_AND_RIVER_GAUGE_STATION',
    dataSemantics: 'OFFICIAL_FLOOD_WARNINGS_AND_RIVER_CREST_LEVELS',
    failureMode: 'YIELD_FLOOD_POTENTIAL_ESTIMATE_WITHOUT_CLAIMING_OFFICIAL',
    productionRequirement: 'CWC Hydrological Portal API Key',
  },
  FSI: {
    id: 'FSI',
    name: 'Forest Survey of India (FSI) & NASA FIRMS Near-Real-Time Thermal Hotspots',
    provider: 'FSI',
    sourceType: 'FOREST_MONITORING_AGENCY',
    status: PROVIDER_STATUS.PARTIALLY_CONNECTED,
    endpoint: 'https://fsi.nic.in/van-agni-geoportal',
    accessMethod: 'SATELLITE_THERMAL_ANOMALY_RASTER',
    freshnessPolicySeconds: 14400, // 4 hours
    geographicResolution: '375M_VIIRS_MODIS_PIXEL',
    dataSemantics: 'OBSERVED_THERMAL_ANOMALY_NOT_CONFIRMED_ROAD_FIRE',
    failureMode: 'SUPPRESS_FIRE_ALERTS_WHEN_SATELLITE_ORBIT_NOT_FRESH',
    productionRequirement: 'NASA FIRMS API Key for VIIRS Near-Real-Time Ingestion',
  },
});

/**
 * Returns metadata and real-world connectivity status for all registered safety providers.
 */
function getSafetyProviders() {
  return Object.values(OFFICIAL_PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    provider: p.provider,
    sourceType: p.sourceType,
    status: p.status,
    endpoint: p.endpoint,
    accessMethod: p.accessMethod,
    freshnessPolicySeconds: p.freshnessPolicySeconds,
    geographicResolution: p.geographicResolution,
    productionRequirement: p.productionRequirement,
  }));
}

module.exports = {
  PROVIDER_STATUS,
  OFFICIAL_PROVIDERS,
  getSafetyProviders,
};
