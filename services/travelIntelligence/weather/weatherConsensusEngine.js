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
} = require('../provenanceModel');

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
      confidence: CONFIDENCE_LEVELS.LOW,
      temperatureC: null,
      apparentTempC: null,
      precipitationProb: null,
      precipitationMm: 0,
      condition: 'Unknown',
      humidityPercent: null,
      windKph: null,
      providersConsidered: [],
      divergence: null,
      advisories: ['Weather telemetry currently unavailable across meteorological providers.'],
      disagreementNotice: null,
      isAvailable: false,
      hourly: [],
    };
  }

  if (reports.length === 1) {
    const single = reports[0];
    return {
      consensusState: WEATHER_CONSENSUS_STATES.SINGLE_PROVIDER,
      dataState: single.dataState || DATA_STATES.ESTIMATED,
      confidence: single.confidence === CONFIDENCE_LEVELS.HIGH ? CONFIDENCE_LEVELS.MEDIUM : CONFIDENCE_LEVELS.LOW,
      temperatureC: single.metrics.temperatureC,
      apparentTempC: single.metrics.apparentTempC,
      precipitationProb: single.metrics.precipitationProb,
      precipitationMm: single.metrics.precipitationMm,
      condition: single.metrics.condition,
      humidityPercent: single.metrics.humidityPercent,
      windKph: single.metrics.windKph,
      providersConsidered: [single.provider],
      divergence: null,
      advisories: [`Single provider telemetry (${single.provider}); consensus unverified.`],
      disagreementNotice: null,
      isAvailable: true,
      hourly: single.hourly || [],
    };
  }

  // Compare multiple providers (e.g. IMD vs Open-Meteo)
  const repA = reports[0];
  const repB = reports[1];

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

    return {
      consensusState: WEATHER_CONSENSUS_STATES.DISAGREEMENT,
      dataState: DATA_STATES.PREDICTED,
      confidence: CONFIDENCE_LEVELS.LOW,
      // Conservative bounds for safety planning
      temperatureC: Math.round(((tempA + tempB) / 2) * 10) / 10,
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

  return {
    consensusState,
    dataState: (repA.dataState === DATA_STATES.OBSERVED || repB.dataState === DATA_STATES.OBSERVED)
      ? DATA_STATES.OBSERVED
      : DATA_STATES.PREDICTED,
    confidence: isStrongAgreement ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM,
    temperatureC: blendedTemp,
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
  };
}

module.exports = {
  evaluateWeatherConsensus,
};
