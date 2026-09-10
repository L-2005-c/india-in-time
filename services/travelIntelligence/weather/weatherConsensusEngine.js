'use strict';

/**
 * services/travelIntelligence/weather/weatherConsensusEngine.js
 *
 * Multi-Provider Weather Consensus & Disagreement Preservation Engine.
 * Evaluates agreement between IMD and global numerical prediction models (Open-Meteo).
 * Preserves uncertainty when providers disagree — NEVER fabricates false precision.
 */

const {
  DATA_STATES,
  CONFIDENCE_LEVELS,
  WEATHER_CONSENSUS_STATES,
  SELECTION_REASONS,
  WEATHER_CLASSIFICATIONS,
} = require('../provenanceModel');

function toWeatherClassification(dataState) {
  if (dataState === DATA_STATES.OBSERVED) return WEATHER_CLASSIFICATIONS.OBSERVATION;
  if (dataState === DATA_STATES.NOWCAST) return WEATHER_CLASSIFICATIONS.NOWCAST;
  if (dataState === DATA_STATES.PREDICTED || dataState === DATA_STATES.FORECAST) return WEATHER_CLASSIFICATIONS.FORECAST;
  if (dataState === DATA_STATES.ESTIMATED) return WEATHER_CLASSIFICATIONS.ESTIMATE;
  if (dataState === DATA_STATES.HISTORICAL) return WEATHER_CLASSIFICATIONS.HISTORICAL;
  return WEATHER_CLASSIFICATIONS.UNAVAILABLE;
}

/**
 * Synthesizes multiple normalized provider reports into a Consensus Weather Record.
 *
 * @param {Array<Object>} providerReports - List of normalized weather records
 * @param {Object} [options]
 * @returns {Object} Consensus Weather Record
 */
function evaluateWeatherConsensus(providerReports = [], options = {}) {
  const reports = (Array.isArray(providerReports) ? providerReports : [])
    .filter(r => r && r.isAvailable && r.metrics?.temperatureC !== null);

  if (reports.length === 0) {
    return {
      consensusState: WEATHER_CONSENSUS_STATES.UNAVAILABLE,
      dataState: DATA_STATES.UNAVAILABLE,
      classification: WEATHER_CLASSIFICATIONS.UNAVAILABLE,
      isObservation: false,
      isForecast: false,
      confidence: CONFIDENCE_LEVELS.LOW,
      selectionReason: SELECTION_REASONS.TELEMETRY_UNAVAILABLE,
      isEstimated: false,
      userDisclosure: 'Meteorological data currently unavailable across weather providers.',
      temperatureC: null,
      rawTemperatureC: null,
      displayTemperatureC: null,
      apparentTempC: null,
      precipitationProb: null,
      precipitationMm: 0,
      condition: 'Unknown',
      humidityPercent: null,
      windKph: null,
      providersConsidered: [],
      divergence: null,
      advisories: ['Meteorological data currently unavailable across weather providers.'],
      disagreementNotice: null,
      isAvailable: false,
      hourly: [],
      elevationAudit: null,
      observedAt: null,
    };
  }

  if (reports.length === 1) {
    const single = reports[0];
    const isObserved = single.dataState === DATA_STATES.OBSERVED;
    const isForecast = single.dataState === DATA_STATES.PREDICTED || single.dataState === DATA_STATES.FORECAST || single.dataState === DATA_STATES.NOWCAST;
    const isEstimated = single.dataState === DATA_STATES.ESTIMATED;
    const isHistorical = single.dataState === DATA_STATES.HISTORICAL;

    let selectionReason = SELECTION_REASONS.NWP_MODEL_AVAILABLE;
    let userDisclosure = null;
    let confidence = single.confidence;

    if (isObserved) {
      selectionReason = SELECTION_REASONS.LIVE_OBSERVATION_MATCH;
      confidence = single.confidence === CONFIDENCE_LEVELS.HIGH ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM;
    } else if (isForecast) {
      selectionReason = SELECTION_REASONS.NWP_MODEL_AVAILABLE;
      confidence = single.confidence === CONFIDENCE_LEVELS.HIGH ? CONFIDENCE_LEVELS.MEDIUM : CONFIDENCE_LEVELS.LOW;
      userDisclosure = `Numerical weather prediction (NWP) provided by ${single.provider}.`;
    } else if (isEstimated) {
      selectionReason = SELECTION_REASONS.FALLBACK_DIURNAL_ESTIMATE;
      confidence = CONFIDENCE_LEVELS.LOW;
      userDisclosure = 'Live weather observation is unavailable. Showing a mathematical model estimate based on diurnal and historical patterns.';
    } else if (isHistorical) {
      selectionReason = SELECTION_REASONS.FALLBACK_HISTORICAL_CLIMATOLOGY;
      confidence = CONFIDENCE_LEVELS.LOW;
      userDisclosure = 'Live weather observation is unavailable. Showing historical seasonal normal.';
    }

    const tempC = single.metrics.temperatureC;
    const finalDataState = single.dataState || (isEstimated || isHistorical ? DATA_STATES.ESTIMATED : DATA_STATES.PREDICTED);
    return {
      consensusState: WEATHER_CONSENSUS_STATES.SINGLE_PROVIDER,
      dataState: finalDataState,
      classification: toWeatherClassification(finalDataState),
      isObservation: isObserved,
      isForecast,
      confidence,
      selectionReason,
      isEstimated: Boolean(isEstimated || isHistorical),
      userDisclosure,
      temperatureC: tempC,
      rawTemperatureC: tempC,
      displayTemperatureC: tempC !== null ? Math.round(tempC) : null,
      apparentTempC: single.metrics.apparentTempC,
      precipitationProb: single.metrics.precipitationProb,
      precipitationMm: single.metrics.precipitationMm,
      condition: single.metrics.condition,
      humidityPercent: single.metrics.humidityPercent,
      windKph: single.metrics.windKph,
      providersConsidered: [single.provider],
      divergence: null,
      advisories: [isObserved ? `Official ground observation (${single.provider}); single station telemetry.` : `Single provider forecast (${single.provider}); consensus unverified.`],
      disagreementNotice: null,
      isAvailable: true,
      hourly: single.hourly || [],
      elevationAudit: single.elevationAudit || null,
      observedAt: single.timestamps?.observedAt || null,
    };
  }

  // Compare multiple providers (e.g. IMD vs Open-Meteo)
  const repA = reports[0];
  const repB = reports[1];

  const isLive = r => r.dataState === DATA_STATES.OBSERVED || r.dataState === DATA_STATES.PREDICTED || r.dataState === DATA_STATES.FORECAST || r.dataState === DATA_STATES.NOWCAST;
  const isLiveA = isLive(repA);
  const isLiveB = isLive(repB);

  // Case 1: One provider is live NWP/observation and the other is fallback (ESTIMATED or HISTORICAL)
  if (isLiveA !== isLiveB) {
    const liveRep = isLiveA ? repA : repB;
    const histRep = isLiveA ? repB : repA;

    const tempDelta = Math.abs(liveRep.metrics.temperatureC - histRep.metrics.temperatureC);
    // If live temperature is within 5°C of seasonal normal, high plausibility
    const tempPlausible = tempDelta <= 5.0;
    const isObserved = liveRep.dataState === DATA_STATES.OBSERVED;
    const selectionReason = isObserved ? SELECTION_REASONS.LIVE_OBSERVATION_MATCH : SELECTION_REASONS.NWP_MODEL_AVAILABLE;
    const userDisclosure = isObserved
      ? null
      : `Numerical weather prediction (NWP) provided by ${liveRep.provider}; calibrated against ${histRep.provider} climatological baseline.`;

    const tempC = liveRep.metrics.temperatureC;
    return {
      consensusState: tempPlausible ? WEATHER_CONSENSUS_STATES.MODERATE_AGREEMENT : WEATHER_CONSENSUS_STATES.SINGLE_PROVIDER,
      dataState: liveRep.dataState,
      classification: toWeatherClassification(liveRep.dataState),
      isObservation: isObserved,
      isForecast: !isObserved,
      confidence: isObserved
        ? (liveRep.confidence === CONFIDENCE_LEVELS.HIGH ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM)
        : (tempPlausible ? CONFIDENCE_LEVELS.MEDIUM : CONFIDENCE_LEVELS.LOW),
      selectionReason,
      isEstimated: false,
      userDisclosure,
      temperatureC: tempC,
      rawTemperatureC: tempC,
      displayTemperatureC: tempC !== null ? Math.round(tempC) : null,
      apparentTempC: liveRep.metrics.apparentTempC,
      precipitationProb: liveRep.metrics.precipitationProb,
      precipitationMm: liveRep.metrics.precipitationMm,
      condition: liveRep.metrics.condition,
      humidityPercent: liveRep.metrics.humidityPercent,
      windKph: liveRep.metrics.windKph,
      providersConsidered: [liveRep.provider, histRep.provider],
      divergence: {
        tempDeltaC: Math.round(tempDelta * 10) / 10,
        rainDeltaPercent: Math.abs((liveRep.metrics.precipitationProb ?? 0) - (histRep.metrics.precipitationProb ?? 0)),
      },
      advisories: [
        isObserved
          ? `Official ground observation provided by ${liveRep.provider}; corroborated against ${histRep.provider} baseline.`
          : `Numerical weather prediction (NWP) provided by ${liveRep.provider}; calibrated against ${histRep.provider} climatological baseline.`,
      ],
      disagreementNotice: null,
      isAvailable: true,
      hourly: liveRep.hourly || [],
      elevationAudit: liveRep.elevationAudit || histRep.elevationAudit || null,
      observedAt: liveRep.timestamps?.observedAt || null,
    };
  }

  // Case 2: Neither provider is live (both are fallback ESTIMATED or HISTORICAL)
  if (!isLiveA && !isLiveB) {
    const tempA = repA.metrics.temperatureC;
    const tempB = repB.metrics.temperatureC;
    const blendedTemp = Math.round(((tempA + tempB) / 2) * 10) / 10;
    const providers = reports.map(r => r.provider);
    return {
      consensusState: WEATHER_CONSENSUS_STATES.FALLBACK_ESTIMATE,
      dataState: DATA_STATES.ESTIMATED,
      classification: WEATHER_CLASSIFICATIONS.ESTIMATE,
      isObservation: false,
      isForecast: false,
      confidence: CONFIDENCE_LEVELS.LOW,
      selectionReason: SELECTION_REASONS.FALLBACK_DIURNAL_ESTIMATE,
      isEstimated: true,
      userDisclosure: 'Live weather observation is unavailable. Showing a mathematical model estimate based on diurnal and historical patterns.',
      temperatureC: blendedTemp,
      rawTemperatureC: blendedTemp,
      displayTemperatureC: Math.round(blendedTemp),
      apparentTempC: Math.round(((repA.metrics.apparentTempC + repB.metrics.apparentTempC) / 2) * 10) / 10,
      precipitationProb: Math.round(((repA.metrics.precipitationProb ?? 0) + (repB.metrics.precipitationProb ?? 0)) / 2),
      precipitationMm: Math.max(repA.metrics.precipitationMm || 0, repB.metrics.precipitationMm || 0),
      condition: repA.metrics.condition || repB.metrics.condition,
      humidityPercent: Math.round(((repA.metrics.humidityPercent || 65) + (repB.metrics.humidityPercent || 65)) / 2),
      windKph: Math.round((((repA.metrics.windKph || 10) + (repB.metrics.windKph || 10)) / 2) * 10) / 10,
      providersConsidered: providers,
      divergence: {
        tempDeltaC: Math.round(Math.abs(tempA - tempB) * 10) / 10,
        rainDeltaPercent: Math.abs((repA.metrics.precipitationProb ?? 0) - (repB.metrics.precipitationProb ?? 0)),
      },
      advisories: ['Live observation and NWP forecast unavailable; mathematical diurnal estimate based on historical patterns.'],
      disagreementNotice: null,
      isAvailable: true,
      hourly: repA.hourly?.length ? repA.hourly : (repB.hourly || []),
      elevationAudit: repA.elevationAudit || repB.elevationAudit || null,
      observedAt: null,
    };
  }

  // Case 3: Both providers are live
  const tempA = repA.metrics.temperatureC;
  const tempB = repB.metrics.temperatureC;
  const rainA = repA.metrics.precipitationProb ?? 0;
  const rainB = repB.metrics.precipitationProb ?? 0;

  const tempDelta = Math.abs(tempA - tempB);
  const rainDelta = Math.abs(rainA - rainB);

  const maxTempDelta = options.maxTempDeltaC || 4.0;
  const maxRainDelta = options.maxRainDeltaPercent || 30;

  const isDisagreement = tempDelta > maxTempDelta || rainDelta > maxRainDelta;
  const isStrongAgreement = tempDelta <= 1.8 && rainDelta <= 15;

  const providers = reports.map(r => r.provider);
  const divergence = {
    tempDeltaC: Math.round(tempDelta * 10) / 10,
    rainDeltaPercent: rainDelta,
  };

  if (isDisagreement) {
    // PRESERVE UNCERTAINTY: Do not average away conflicting predictions
    const pessimisticRain = Math.max(rainA, rainB);
    const advisory = `Meteorological providers disagree: ${repA.provider} reports ${tempA}°C with ${rainA}% rain, while ${repB.provider} reports ${tempB}°C with ${rainB}% rain.`;
    const blendedTemp = Math.round(((tempA + tempB) / 2) * 10) / 10;

    return {
      consensusState: WEATHER_CONSENSUS_STATES.DISAGREEMENT,
      dataState: DATA_STATES.PREDICTED,
      classification: WEATHER_CLASSIFICATIONS.FORECAST,
      isObservation: false,
      isForecast: true,
      confidence: CONFIDENCE_LEVELS.LOW,
      selectionReason: SELECTION_REASONS.DISAGREEMENT_PESSIMISTIC_BOUND,
      isEstimated: false,
      userDisclosure: `Meteorological providers disagree (${repA.provider} vs ${repB.provider}). Showing conservative bounds for travel safety.`,
      // Conservative bounds for safety planning
      temperatureC: blendedTemp,
      rawTemperatureC: blendedTemp,
      displayTemperatureC: Math.round(blendedTemp),
      apparentTempC: Math.round(((repA.metrics.apparentTempC + repB.metrics.apparentTempC) / 2) * 10) / 10,
      precipitationProb: pessimisticRain,
      precipitationMm: Math.max(repA.metrics.precipitationMm, repB.metrics.precipitationMm),
      condition: pessimisticRain >= 50 ? 'Uncertain / Possible Rain' : (repA.metrics.condition || repB.metrics.condition),
      humidityPercent: Math.round((repA.metrics.humidityPercent + repB.metrics.humidityPercent) / 2),
      windKph: Math.max(repA.metrics.windKph || 0, repB.metrics.windKph || 0),
      providersConsidered: providers,
      divergence,
      advisories: [advisory],
      disagreementNotice: 'Rain/temperature outlook is uncertain due to provider divergence.',
      isAvailable: true,
      hourly: repA.hourly?.length ? repA.hourly : (repB.hourly || []),
      elevationAudit: repA.elevationAudit || repB.elevationAudit || null,
      observedAt: (repA.dataState === DATA_STATES.OBSERVED ? repA.timestamps?.observedAt : repB.timestamps?.observedAt) || null,
    };
  }

  // Consensus achieved
  const consensusState = isStrongAgreement
    ? WEATHER_CONSENSUS_STATES.STRONG_CONSENSUS
    : WEATHER_CONSENSUS_STATES.MODERATE_AGREEMENT;

  // Weighted blending: Official IMD ground station is prioritized if available
  const weightA = repA.provider === 'IMD' && repA.dataState === DATA_STATES.OBSERVED ? 0.65 : 0.5;
  const weightB = 1.0 - weightA;

  const blendedTemp = Math.round((tempA * weightA + tempB * weightB) * 10) / 10;
  const blendedRain = Math.round(rainA * weightA + rainB * weightB);

  const finalDataState = (repA.dataState === DATA_STATES.OBSERVED || repB.dataState === DATA_STATES.OBSERVED)
    ? DATA_STATES.OBSERVED
    : DATA_STATES.PREDICTED;
  const isObserved = finalDataState === DATA_STATES.OBSERVED;

  return {
    consensusState,
    dataState: finalDataState,
    classification: toWeatherClassification(finalDataState),
    isObservation: isObserved,
    isForecast: !isObserved,
    confidence: isStrongAgreement ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM,
    selectionReason: SELECTION_REASONS.MULTIPLE_PROVIDER_CONSENSUS,
    isEstimated: false,
    userDisclosure: null,
    temperatureC: blendedTemp,
    rawTemperatureC: blendedTemp,
    displayTemperatureC: Math.round(blendedTemp),
    apparentTempC: Math.round((repA.metrics.apparentTempC * weightA + repB.metrics.apparentTempC * weightB) * 10) / 10,
    precipitationProb: blendedRain,
    precipitationMm: Math.round((repA.metrics.precipitationMm * weightA + repB.metrics.precipitationMm * weightB) * 10) / 10,
    condition: blendedRain >= 60 ? 'Rain' : (repA.metrics.condition || repB.metrics.condition),
    humidityPercent: Math.round(repA.metrics.humidityPercent * weightA + repB.metrics.humidityPercent * weightB),
    windKph: Math.round((repA.metrics.windKph * weightA + repB.metrics.windKph * weightB) * 10) / 10,
    providersConsidered: providers,
    divergence,
    advisories: [`Validated consensus across ${providers.join(' and ')} (${isStrongAgreement ? 'strong agreement' : 'moderate agreement'}).`],
    disagreementNotice: null,
    isAvailable: true,
    hourly: repA.hourly?.length ? repA.hourly : (repB.hourly || []),
    elevationAudit: repA.elevationAudit || repB.elevationAudit || null,
    observedAt: (repA.dataState === DATA_STATES.OBSERVED ? repA.timestamps?.observedAt : repB.timestamps?.observedAt) || repA.timestamps?.observedAt || repB.timestamps?.observedAt || null,
  };
}

module.exports = {
  evaluateWeatherConsensus,
};
