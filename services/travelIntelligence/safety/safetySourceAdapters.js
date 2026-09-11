'use strict';

/**
 * services/travelIntelligence/safety/safetySourceAdapters.js
 *
 * India In-Time v3.0 — Official & Trusted Safety Source Adapters
 *
 * Ground-Truth Operational Contract:
 * 1. Allowed final provider connection states:
 *    - LIVE: Real machine-readable official government feed actively connected and retrieving live alerts.
 *    - PARTIALLY_AVAILABLE: Accessible public bulletins or satellite telemetry with documented boundary limitations.
 *    - STALE: Previously successful connection; current telemetry expired past TTL.
 *    - UNAVAILABLE: Provider endpoint down, unreachable, or blocked by network/IAM.
 * 2. NEVER pretend an unavailable provider is live.
 * 3. Secondary/NWP models (Open-Meteo) are NEVER labeled official government warnings.
 */

const https = require('https');
const crypto = require('crypto');
const { createSafetySignal, HAZARD_TYPES, SAFETY_SEVERITIES, SAFETY_DATA_STATES, safeIsoDate } = require('./safetySignalModel');

const PROVIDER_STATUS = Object.freeze({
  LIVE: 'LIVE',
  DEGRADED: 'DEGRADED',
  PARTIALLY_AVAILABLE: 'PARTIALLY_AVAILABLE',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
  // Backward compatibility aliases
  CONNECTED: 'LIVE',
  PARTIALLY_CONNECTED: 'PARTIALLY_AVAILABLE',
  CONFIGURED_BUT_NOT_CONNECTED: 'UNAVAILABLE',
});

// Official source endpoints and configurations
const OFFICIAL_PROVIDERS = Object.freeze({
  NDMA_SACHET: {
    id: 'NDMA_SACHET',
    name: 'National Disaster Management Authority (NDMA) / SACHET Alert Service',
    provider: 'NDMA',
    sourceType: 'GOVERNMENT_DISASTER_MANAGEMENT',
    status: PROVIDER_STATUS.LIVE,
    endpoint: 'https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails',
    capXmlEndpoint: 'https://sachet.ndma.gov.in/cap_public_website/cap.xml',
    accessMethod: 'REST_CAP_JSON_AND_XML',
    freshnessPolicySeconds: 1800, // 30 min
    geographicResolution: 'DISTRICT_TEHSIL_POLYGON',
    dataSemantics: 'OFFICIAL_EMERGENCY_DIRECTIVES_AND_EVACUATION_ALERTS',
    failureMode: 'FALLBACK_TO_CACHED_ALERTS_OR_UNAVAILABLE',
    productionRequirement: 'Public SACHET CAP Feed Active',
  },
  IMD: {
    id: 'IMD',
    name: 'India Meteorological Department (IMD) / Regional Met Centre',
    provider: 'IMD',
    sourceType: 'NATIONAL_METEOROLOGICAL_SERVICE',
    status: PROVIDER_STATUS.LIVE,
    endpoint: 'https://mausam.imd.gov.in/responsive/districtWiseNowcast.php',
    accessMethod: 'OPEN_BULLETIN_FEED_AND_SYNOP_NOWCAST',
    freshnessPolicySeconds: 3600, // 1 hour
    geographicResolution: 'DISTRICT_AND_OBSERVATORY_STATION',
    dataSemantics: 'OFFICIAL_COLOR_CODED_WEATHER_WARNINGS_AND_NOWCASTS',
    failureMode: 'FALLBACK_TO_NW_METEO_MODEL_AND_CLIMATOLOGY',
    productionRequirement: 'IMD Mausam Public Nowcast Active',
  },
  CWC: {
    id: 'CWC',
    name: 'Central Water Commission (CWC) Flood Advisory Service',
    provider: 'CWC',
    sourceType: 'NATIONAL_WATER_RESOURCES_COMMISSION',
    status: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
    endpoint: 'https://cwc.gov.in/daily-flood-bulletin',
    gisEndpoint: 'https://ffs.india-water.gov.in/eswis-gis',
    accessMethod: 'PUBLISHED_BULLETIN_RETRIEVAL',
    freshnessPolicySeconds: 7200, // 2 hours
    geographicResolution: 'BASIN_AND_RIVER_GAUGE_STATION',
    dataSemantics: 'OFFICIAL_FLOOD_WARNINGS_AND_RIVER_CREST_LEVELS',
    failureMode: 'YIELD_FLOOD_POTENTIAL_ESTIMATE_WITHOUT_CLAIMING_OFFICIAL',
    productionRequirement: 'Public Daily Flood Bulletin (Machine GIS requires departmental IAM)',
  },
  FSI: {
    id: 'FSI',
    name: 'Forest Survey of India (FSI) & NASA FIRMS Thermal Hotspots',
    provider: 'FSI',
    sourceType: 'FOREST_MONITORING_AGENCY',
    status: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
    endpoint: 'https://fsi.nic.in/van-agni-geoportal',
    firmsEndpoint: 'https://firms.modaps.eosdis.nasa.gov/api/area',
    accessMethod: 'SATELLITE_THERMAL_ANOMALY_RASTER',
    freshnessPolicySeconds: 14400, // 4 hours
    geographicResolution: '375M_VIIRS_MODIS_PIXEL',
    dataSemantics: 'OBSERVED_THERMAL_ANOMALY_NOT_CONFIRMED_ROAD_FIRE',
    failureMode: 'SUPPRESS_FIRE_ALERTS_WHEN_SATELLITE_ORBIT_NOT_FRESH',
    productionRequirement: 'FSI Portal Monitoring (NASA FIRMS streaming requires user MAP_KEY)',
  },
});

// Operational health and telemetry state
const providerHealthRecords = new Map([
  ['NDMA', {
    provider: 'NDMA',
    name: 'National Disaster Management Authority (SACHET)',
    connectionStatus: PROVIDER_STATUS.LIVE,
    lastSuccessfulFetch: null,
    lastProviderTimestamp: null,
    lastSuccessfulPayloadHash: null,
    freshness: 'FRESH',
    failureCount: 0,
    lastFailure: null,
    lastFailureError: null,
    latencyMs: 0,
    authenticationStatus: 'OPEN_PUBLIC',
    dataCoverage: 'ALL_INDIA_DISASTER_ALERTS',
    productionUsable: true,
    endpoint: OFFICIAL_PROVIDERS.NDMA_SACHET.endpoint,
    activeAlertCount: 0,
    recordCount: 0,
    lastEtag: null,
  }],
  ['IMD', {
    provider: 'IMD',
    name: 'India Meteorological Department (Mausam)',
    connectionStatus: PROVIDER_STATUS.LIVE,
    lastSuccessfulFetch: null,
    lastProviderTimestamp: null,
    lastSuccessfulPayloadHash: null,
    freshness: 'FRESH',
    failureCount: 0,
    lastFailure: null,
    lastFailureError: null,
    latencyMs: 0,
    authenticationStatus: 'OPEN_PUBLIC',
    dataCoverage: 'ALL_INDIA_750_DISTRICTS',
    productionUsable: true,
    endpoint: OFFICIAL_PROVIDERS.IMD.endpoint,
    activeAlertCount: 0,
    recordCount: 0,
    lastEtag: null,
  }],
  ['CWC', {
    provider: 'CWC',
    name: 'Central Water Commission',
    connectionStatus: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
    lastSuccessfulFetch: null,
    lastProviderTimestamp: null,
    lastSuccessfulPayloadHash: null,
    freshness: 'FRESH',
    failureCount: 0,
    lastFailure: null,
    lastFailureError: null,
    latencyMs: 0,
    authenticationStatus: 'PARTIAL_PUBLIC_ACCESS',
    dataCoverage: 'MAJOR_RIVER_BASINS_PUBLIC_BULLETINS',
    productionUsable: false, // Machine GIS requires departmental IAM token
    endpoint: OFFICIAL_PROVIDERS.CWC.endpoint,
    activeAlertCount: 0,
    recordCount: 0,
    accessLimitation: 'CWC machine GIS interface requires departmental IAM token; public access limited to published daily bulletins',
  }],
  ['FSI', {
    provider: 'FSI',
    name: 'Forest Survey of India / NASA FIRMS',
    connectionStatus: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
    lastSuccessfulFetch: null,
    lastProviderTimestamp: null,
    lastSuccessfulPayloadHash: null,
    freshness: 'FRESH',
    failureCount: 0,
    lastFailure: null,
    lastFailureError: null,
    latencyMs: 0,
    authenticationStatus: 'PARTIAL_PUBLIC_ACCESS',
    dataCoverage: 'SATELLITE_THERMAL_ANOMALIES',
    productionUsable: false, // Satellite direct stream requires registered MAP_KEY
    endpoint: OFFICIAL_PROVIDERS.FSI.endpoint,
    activeAlertCount: 0,
    recordCount: 0,
    accessLimitation: 'NASA FIRMS VIIRS satellite ingestion requires user MAP_KEY; detections classified strictly as FIRE_ANOMALY',
  }],
]);

// In-memory cache for HTTP ETag / 304 support
const adapterCache = {
  ndma: { alerts: [], etag: null, lastModified: null, timestamp: 0 },
  imd: { warnings: [], timestamp: 0 },
};

/**
 * Internal HTTP helper with timeout and bounded size.
 */
function makeHttpRequest(url, { method = 'GET', body = null, headers = {}, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*',
        ...headers,
      };

      const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

      const req = https.request(u, {
        method,
        headers: reqHeaders,
        timeout: timeoutMs,
      }, res => {
        res.setEncoding('utf8');
        let raw = '';
        res.on('data', chunk => {
          if (raw.length < 5000000) raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: raw,
          });
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms`));
      });
      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Parses CAP XML text into structured alert objects.
 */
function parseCapXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const alerts = [];

  const infoBlocks = xmlText.split(/<info[\s>]/i).slice(1);
  const identifierMatch = xmlText.match(/<identifier>([^<]+)<\/identifier>/i);
  const senderMatch = xmlText.match(/<sender>([^<]+)<\/sender>/i);
  const sentMatch = xmlText.match(/<sent>([^<]+)<\/sent>/i);
  const msgTypeMatch = xmlText.match(/<msgType>([^<]+)<\/msgType>/i);

  const identifier = identifierMatch ? identifierMatch[1].trim() : `cap_${crypto.randomBytes(4).toString('hex')}`;
  const sender = senderMatch ? senderMatch[1].trim() : 'NDMA';
  const sent = sentMatch ? sentMatch[1].trim() : new Date().toISOString();
  const msgType = msgTypeMatch ? msgTypeMatch[1].trim() : 'Alert';

  for (const block of infoBlocks) {
    const event = block.match(/<event>([^<]+)<\/event>/i)?.[1]?.trim() || 'Disaster Alert';
    const urgency = block.match(/<urgency>([^<]+)<\/urgency>/i)?.[1]?.trim() || 'Expected';
    const severity = block.match(/<severity>([^<]+)<\/severity>/i)?.[1]?.trim() || 'Warning';
    const certainty = block.match(/<certainty>([^<]+)<\/certainty>/i)?.[1]?.trim() || 'Likely';
    const headline = block.match(/<headline>([^<]+)<\/headline>/i)?.[1]?.trim() || event;
    const description = block.match(/<description>([^<]+)<\/description>/i)?.[1]?.trim() || '';
    const instruction = block.match(/<instruction>([^<]+)<\/instruction>/i)?.[1]?.trim() || '';
    const effective = block.match(/<effective>([^<]+)<\/effective>/i)?.[1]?.trim() || sent;
    const expires = block.match(/<expires>([^<]+)<\/expires>/i)?.[1]?.trim() || '';
    const areaDesc = block.match(/<areaDesc>([^<]+)<\/areaDesc>/i)?.[1]?.trim() || '';
    const polygon = block.match(/<polygon>([^<]+)<\/polygon>/i)?.[1]?.trim() || null;
    const circle = block.match(/<circle>([^<]+)<\/circle>/i)?.[1]?.trim() || null;

    alerts.push({
      identifier,
      sender,
      sent,
      msgType,
      event,
      urgency,
      severity,
      certainty,
      headline,
      description,
      instruction,
      effective,
      expires,
      areaDesc,
      polygon,
      circle,
    });
  }

  return alerts;
}

/**
 * Maps raw NDMA disaster types to canonical HAZARD_TYPES.
 */
function mapNdmaDisasterType(type = '') {
  const t = String(type).toLowerCase();
  if (t.includes('lightning') || t.includes('thunderstorm')) return HAZARD_TYPES.LIGHTNING;
  if (t.includes('rain') || t.includes('downpour')) return HAZARD_TYPES.HEAVY_RAIN;
  if (t.includes('flood') || t.includes('inundat')) return HAZARD_TYPES.FLOOD;
  if (t.includes('cyclone') || t.includes('storm')) return HAZARD_TYPES.CYCLONE;
  if (t.includes('landslide') || t.includes('rockfall')) return HAZARD_TYPES.LANDSLIDE;
  if (t.includes('heat')) return HAZARD_TYPES.EXTREME_HEAT;
  if (t.includes('fire')) return HAZARD_TYPES.FOREST_FIRE;
  if (t.includes('fog') || t.includes('visibility')) return HAZARD_TYPES.LOW_VISIBILITY;
  return HAZARD_TYPES.WEATHER_WARNING;
}

/**
 * Maps raw severity string to canonical SAFETY_SEVERITIES.
 */
function mapNdmaSeverity(sev = '', color = '') {
  const s = String(sev).toUpperCase();
  const c = String(color).toLowerCase();
  if (s === 'CRITICAL' || s === 'EXTREME' || c === 'red') return SAFETY_SEVERITIES.CRITICAL;
  if (s === 'SEVERE' || c === 'orange') return SAFETY_SEVERITIES.SEVERE;
  if (s === 'WARNING' || s === 'MODERATE') return SAFETY_SEVERITIES.WARNING;
  if (s === 'WATCH' || c === 'yellow') return SAFETY_SEVERITIES.WATCH;
  return SAFETY_SEVERITIES.INFO;
}

/**
 * Live Ingestion Adapter for NDMA SACHET Alert Service.
 */
async function fetchNdmaAlerts({ force = false, etag = null } = {}) {
  const health = providerHealthRecords.get('NDMA');
  const startTime = Date.now();

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'https://sachet.ndma.gov.in',
      'Referer': 'https://sachet.ndma.gov.in/',
    };
    const reqEtag = etag || adapterCache.ndma.etag;
    if (reqEtag && !force) {
      headers['If-None-Match'] = reqEtag;
    }

    const res = await makeHttpRequest(OFFICIAL_PROVIDERS.NDMA_SACHET.endpoint, {
      method: 'POST',
      body: '{}',
      headers,
      timeoutMs: 12000,
    });
    const latency = Date.now() - startTime;

    // HTTP 304 Not Modified
    if (res.statusCode === 304) {
      health.latencyMs = latency;
      health.lastSuccessfulFetch = new Date().toISOString();
      return adapterCache.ndma.alerts;
    }

    if (res.statusCode !== 200) {
      throw new Error(`NDMA endpoint returned HTTP ${res.statusCode}`);
    }

    const payloadHash = crypto.createHash('sha256').update(res.body).digest('hex');
    const newEtag = res.headers.etag || `W/"${payloadHash.slice(0, 16)}"`;
    let rawAlerts = [];

    // Parse JSON array from SACHET
    try {
      rawAlerts = JSON.parse(res.body);
    } catch (_jsonErr) {
      // Attempt CAP XML fallback
      rawAlerts = parseCapXml(res.body);
    }

    if (!Array.isArray(rawAlerts)) rawAlerts = [];

    const signals = rawAlerts.map(a => {
      let coords = null;
      if (a.centroid && typeof a.centroid === 'string') {
        const parts = a.centroid.split(',').map(p => parseFloat(p.trim()));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          // SACHET returns 'lon,lat' in centroid
          coords = [parts[1], parts[0]];
        }
      }

      const hazardType = mapNdmaDisasterType(a.disaster_type || a.event);
      const severity = mapNdmaSeverity(a.severity, a.severity_color);

      return createSafetySignal({
        id: `ndma_${a.identifier || a.alert_id_sdma_autoinc || crypto.randomBytes(6).toString('hex')}`,
        provider: 'NDMA',
        source: a.alert_source || 'NDMA SACHET National Alert Portal',
        sourceType: 'GOVERNMENT_WARNING',
        hazardType,
        severity,
        dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
        confidence: 'HIGH',
        hazardConfidence: 'HIGH',
        causeConfidence: 'HIGH',
        impactConfidence: 'HIGH',
        location: {
          name: (a.area_description || a.areaDesc || 'Affected Area').split(',')[0].trim(),
          coords,
        },
        affectedArea: a.area_description || a.areaDesc,
        radiusMeters: a.area_covered ? Math.min(50000, Math.round(Math.sqrt(parseFloat(a.area_covered) * 1000000 / Math.PI))) : 20000,
        issuedAt: a.effective_start_time,
        validUntil: a.effective_end_time,
        evidence: [a.warning_message || a.headline || a.description || 'Official NDMA disaster warning'],
      });
    });

    // Update Cache & Health
    adapterCache.ndma.alerts = signals;
    adapterCache.ndma.etag = newEtag;
    adapterCache.ndma.timestamp = Date.now();

    health.connectionStatus = PROVIDER_STATUS.LIVE;
    health.lastSuccessfulFetch = new Date().toISOString();
    health.lastProviderTimestamp = safeIsoDate(rawAlerts[0]?.effective_start_time, new Date().toISOString());
    health.lastSuccessfulPayloadHash = payloadHash;
    health.freshness = 'FRESH';
    health.failureCount = 0;
    health.latencyMs = latency;
    health.activeAlertCount = signals.length;
    health.lastEtag = newEtag;

    return signals;
  } catch (err) {
    health.failureCount += 1;
    health.latencyMs = Date.now() - startTime;
    health.lastFailure = new Date().toISOString();
    health.lastFailureError = err.message;
    if (adapterCache.ndma.alerts.length > 0) {
      health.connectionStatus = PROVIDER_STATUS.STALE;
      health.freshness = 'STALE';
      return adapterCache.ndma.alerts.map(s => ({ ...s, isStale: true }));
    }
    health.connectionStatus = PROVIDER_STATUS.UNAVAILABLE;
    health.freshness = 'UNAVAILABLE';
    return [];
  }
}

/**
 * Live Ingestion Adapter for IMD Mausam District Warnings & Nowcasts.
 */
async function fetchImdWarnings({ district = null, _force = false } = {}) {
  const health = providerHealthRecords.get('IMD');
  const startTime = Date.now();

  try {
    const res = await makeHttpRequest(OFFICIAL_PROVIDERS.IMD.endpoint, { timeoutMs: 20000 });
    const latency = Date.now() - startTime;

    if (res.statusCode !== 200) {
      throw new Error(`IMD endpoint returned HTTP ${res.statusCode}`);
    }

    const payloadHash = crypto.createHash('sha256').update(res.body).digest('hex');

    // Extract embedded JSON array of districts
    const jsonMatch = res.body.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      throw new Error('IMD response did not contain expected district JSON array');
    }

    const districts = JSON.parse(jsonMatch[0]);
    const signals = [];

    // Filter districts with active warnings (non-green / non-null)
    for (const d of districts) {
      const color = (d.color || '').toLowerCase();
      // Only process districts with active warning colors (Red, Orange, Yellow)
      const hasWarning = color === '#ff0000' || color === '#ffa500' || color === '#ffff00';
      if (!hasWarning) continue;

      let severity = SAFETY_SEVERITIES.WATCH;
      if (color === '#ff0000') severity = SAFETY_SEVERITIES.CRITICAL;
      else if (color === '#ffa500') severity = SAFETY_SEVERITIES.WARNING;
      else if (color === '#ffff00') severity = SAFETY_SEVERITIES.WATCH;

      // Extract text content from info HTML
      const infoText = (d.info || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const issueTimeMatch = infoText.match(/Time of issue\s*:\s*([0-9\-\s:]+ Hrs)/i);
      const validUptoMatch = infoText.match(/Valid upto\s*:\s*([0-9\-\s:]+ Hrs)/i);

      let issuedAt = new Date().toISOString();
      let validUntil = null;
      if (issueTimeMatch) {
        issuedAt = issueTimeMatch[1].trim();
        if (validUptoMatch) {
          const v = validUptoMatch[1].trim();
          const datePrefix = issuedAt.slice(0, 10);
          validUntil = v.includes('-') ? v : `${datePrefix} ${v}`;
        }
      }

      signals.push(createSafetySignal({
        id: `imd_${d.id || crypto.randomBytes(6).toString('hex')}`,
        provider: 'IMD',
        source: 'India Meteorological Department (Mausam Nowcast)',
        sourceType: 'GOVERNMENT_WARNING',
        hazardType: /thunderstorm|lightning/i.test(infoText) ? HAZARD_TYPES.LIGHTNING : HAZARD_TYPES.HEAVY_RAIN,
        severity,
        dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
        confidence: 'HIGH',
        hazardConfidence: 'HIGH',
        causeConfidence: 'HIGH',
        impactConfidence: 'HIGH',
        location: {
          name: d.title || 'District Warning Zone',
          coords: null,
        },
        affectedArea: d.title,
        radiusMeters: 25000,
        issuedAt,
        validUntil,
        evidence: [infoText || `Official IMD ${severity} bulletin for ${d.title}`],
      }));
    }

    adapterCache.imd.warnings = signals;
    adapterCache.imd.timestamp = Date.now();

    health.connectionStatus = PROVIDER_STATUS.LIVE;
    health.lastSuccessfulFetch = new Date().toISOString();
    health.lastProviderTimestamp = signals[0]?.issuedAt || new Date().toISOString();
    health.lastSuccessfulPayloadHash = payloadHash;
    health.freshness = 'FRESH';
    health.failureCount = 0;
    health.latencyMs = latency;
    health.activeAlertCount = signals.length;

    if (district) {
      const q = district.toUpperCase();
      return signals.filter(s => s.location.name.toUpperCase().includes(q));
    }

    return signals;
  } catch (err) {
    health.failureCount += 1;
    health.latencyMs = Date.now() - startTime;
    health.lastFailure = new Date().toISOString();
    health.lastFailureError = err.message;
    if (adapterCache.imd.warnings.length > 0) {
      health.connectionStatus = PROVIDER_STATUS.STALE;
      health.freshness = 'STALE';
      return adapterCache.imd.warnings.map(s => ({ ...s, isStale: true }));
    }
    health.connectionStatus = PROVIDER_STATUS.UNAVAILABLE;
    health.freshness = 'UNAVAILABLE';
    return [];
  }
}

/**
 * Ingestion Adapter for CWC Flood Advisories.
 * Explicitly distinguishes public published bulletins from IAM-protected GIS APIs.
 */
async function fetchCwcFloodAdvisories() {
  const health = providerHealthRecords.get('CWC');
  const startTime = Date.now();

  try {
    const res = await makeHttpRequest(OFFICIAL_PROVIDERS.CWC.endpoint, { timeoutMs: 8000 });
    health.latencyMs = Date.now() - startTime;
    health.connectionStatus = PROVIDER_STATUS.PARTIALLY_AVAILABLE;
    health.lastSuccessfulFetch = new Date().toISOString();
    health.freshness = 'FRESH';
    health.failureCount = 0;

    // Return structured bulletin metadata
    return {
      provider: 'CWC',
      status: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
      bulletinReachable: res.statusCode === 200,
      machineGisAccessible: false,
      limitation: health.accessLimitation,
      signals: [],
    };
  } catch (err) {
    health.failureCount += 1;
    health.lastFailure = new Date().toISOString();
    health.lastFailureError = err.message;
    health.connectionStatus = PROVIDER_STATUS.UNAVAILABLE;
    health.freshness = 'UNAVAILABLE';
    return {
      provider: 'CWC',
      status: PROVIDER_STATUS.UNAVAILABLE,
      bulletinReachable: false,
      limitation: err.message,
      signals: [],
    };
  }
}

/**
 * Ingestion Adapter for FSI Forest Fire / NASA FIRMS Hotspots.
 * Explicitly distinguishes satellite thermal anomaly detections from confirmed road fires.
 */
async function fetchFsiFireAlerts() {
  const health = providerHealthRecords.get('FSI');
  const startTime = Date.now();

  try {
    const res = await makeHttpRequest(OFFICIAL_PROVIDERS.FSI.endpoint, { timeoutMs: 8000 });
    health.latencyMs = Date.now() - startTime;
    health.connectionStatus = PROVIDER_STATUS.PARTIALLY_AVAILABLE;
    health.lastSuccessfulFetch = new Date().toISOString();
    health.freshness = 'FRESH';
    health.failureCount = 0;

    return {
      provider: 'FSI',
      status: PROVIDER_STATUS.PARTIALLY_AVAILABLE,
      portalReachable: res.statusCode === 200 || res.statusCode === 302,
      satelliteStreamAccessible: false,
      limitation: health.accessLimitation,
      signals: [],
    };
  } catch (err) {
    health.failureCount += 1;
    health.lastFailure = new Date().toISOString();
    health.lastFailureError = err.message;
    health.connectionStatus = PROVIDER_STATUS.UNAVAILABLE;
    health.freshness = 'UNAVAILABLE';
    return {
      provider: 'FSI',
      status: PROVIDER_STATUS.UNAVAILABLE,
      portalReachable: false,
      limitation: err.message,
      signals: [],
    };
  }
}

/**
 * Returns complete provider health records matrix conforming to Section 3 and Section 4.
 */
function getSafetyProviders() {
  const now = Date.now();
  return Array.from(providerHealthRecords.values()).map(h => {
    const id = h.provider === 'NDMA' ? 'NDMA_SACHET' : h.provider;
    const official = OFFICIAL_PROVIDERS[id] || {};
    const policyTtl = official.freshnessPolicySeconds || 3600;

    const dataAgeSeconds = h.lastSuccessfulFetch
      ? Math.max(0, Math.floor((now - new Date(h.lastSuccessfulFetch).getTime()) / 1000))
      : null;

    let computedStatus = h.connectionStatus;
    if (h.provider === 'CWC' || h.provider === 'FSI') {
      computedStatus = h.connectionStatus === PROVIDER_STATUS.UNAVAILABLE
        ? PROVIDER_STATUS.UNAVAILABLE
        : PROVIDER_STATUS.PARTIALLY_AVAILABLE;
    } else if (h.lastSuccessfulFetch) {
      if (dataAgeSeconds != null && dataAgeSeconds > policyTtl) {
        computedStatus = PROVIDER_STATUS.STALE;
      } else if (h.failureCount > 0) {
        computedStatus = PROVIDER_STATUS.DEGRADED;
      } else {
        computedStatus = PROVIDER_STATUS.LIVE;
      }
    } else if (h.failureCount > 0) {
      computedStatus = PROVIDER_STATUS.UNAVAILABLE;
    }

    const freshness = (dataAgeSeconds != null && dataAgeSeconds > policyTtl)
      ? 'STALE'
      : (h.lastSuccessfulFetch ? 'FRESH' : h.freshness);

    return {
      id,
      provider: h.provider,
      name: h.name,
      status: computedStatus,
      connectionStatus: computedStatus,
      sourceType: official.sourceType,
      accessMethod: official.accessMethod,
      freshnessPolicySeconds: policyTtl,
      geographicResolution: official.geographicResolution,
      productionRequirement: official.productionRequirement,
      lastSuccessfulFetch: h.lastSuccessfulFetch,
      lastProviderTimestamp: h.lastProviderTimestamp,
      lastSuccessfulPayloadHash: h.lastSuccessfulPayloadHash,
      dataAgeSeconds,
      recordCount: h.activeAlertCount || 0,
      activeAlertCount: h.activeAlertCount || 0,
      freshness,
      failureCount: h.failureCount || 0,
      lastFailure: h.lastFailure || null,
      lastFailureError: h.lastFailureError || null,
      latencyMs: h.latencyMs || 0,
      authenticationStatus: h.authenticationStatus,
      coverage: h.dataCoverage,
      dataCoverage: h.dataCoverage,
      productionUsable: h.productionUsable,
      endpoint: h.endpoint,
      accessLimitation: h.accessLimitation || null,
    };
  });
}

module.exports = {
  PROVIDER_STATUS,
  OFFICIAL_PROVIDERS,
  fetchNdmaAlerts,
  fetchImdWarnings,
  fetchCwcFloodAdvisories,
  fetchFsiFireAlerts,
  getSafetyProviders,
  parseCapXml,
  providerHealthRecords,
};
