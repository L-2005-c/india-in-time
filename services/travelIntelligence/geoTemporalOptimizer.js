'use strict';

const { getTravelIntelligenceAsync, getTravelIntelligence } = require('./index');
const { estimateTravel } = require('./trafficEngine');
const { getISTParts, m2t, t2m } = require('./timeEngine');
const { buildTemporalProfile } = require('./temporalEngine');
const { computeDecisionScore, scenarioRobustness } = require('./decisionEngine');

function visitMinutes(place) {
  const defaults = { temple: 45, beach: 90, scenic: 45, museum: 75, fort: 60, park: 45, garden: 40, waterfall: 50, hill: 60, market: 60, food: 50, monument: 50, default: 45 };
  return Math.round(Number(place.vt || place.visitMinutes || defaults[place.cat] || defaults.default));
}

function categoriesScore(stops, place) {
  if (!stops.length) return 0;
  const cats = new Set(stops.map((s) => s.category));
  return cats.has(place.cat) ? -5 : 5;
}

function bestWindowFor(intel) {
  return intel?.experienceWindows?.bestWindow || intel?.scenic?.bestScenicWindow || null;
}

function fitToWindow(arrivalMin, window) {
  if (!window?.startMin && window?.startMin !== 0) return { wait: 0, fit: 50, target: arrivalMin };
  if (arrivalMin < window.startMin) {
    const wait = Math.min(window.startMin - arrivalMin, 120);
    return { wait, fit: Math.max(40, 100 - wait / 2), target: arrivalMin + wait };
  }
  if (arrivalMin <= window.endMin) return { wait: 0, fit: 100, target: arrivalMin };
  const late = arrivalMin - window.endMin;
  return { wait: 0, fit: Math.max(0, 100 - late * 2), target: arrivalMin };
}

function routeFitScore(travel, distanceKm) {
  const minutes = Number(travel?.travelMinutes);
  const km = Number(distanceKm ?? travel?.distanceKm);
  let score = 72;
  if (Number.isFinite(minutes)) score -= Math.min(38, Math.max(0, minutes - 15) * 0.65);
  if (Number.isFinite(km)) score -= Math.min(18, km * 0.9);
  if (travel?.trafficRisk === 'High') score -= 12;
  if (travel?.trafficRisk === 'Medium') score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function chooseTargetWindow(profile, arrivalMin, endMin) {
  const candidates = (profile?.windows || []).filter((w) => {
    const end = Number(w.endMin);
    return Number.isFinite(end) && end >= arrivalMin && end <= endMin;
  });
  candidates.sort((a, b) => {
    const aPenalty = Math.abs((a.peakMin ?? a.startMin) - arrivalMin);
    const bPenalty = Math.abs((b.peakMin ?? b.startMin) - arrivalMin);
    return (b.score - a.score) * 3 - (aPenalty - bPenalty) * 0.2;
  });
  return candidates[0] || profile?.bestWindow || null;
}

function scoreCandidate({ intel, arrivalMin, timingFit, travel, place, state, profile }) {
  const base = Number(intel?.visitScore) || 0;
  const confidence = Number(intel?.confidence?.confidence ?? intel?.confidence ?? 40);
  const routeFit = routeFitScore(travel, travel?.distanceKm);
  const diversity = categoriesScore(state.stops, place);
  const diversityScore = diversity > 0 ? 100 : 35;
  const openingFeasibility = intel?.isOpenNow === false ? 5 : 95;
  const robustness = Number(profile?.confidence?.robustnessScore ?? 55);
  const decision = computeDecisionScore({
    experience: base,
    temporalFit: timingFit,
    routeFit,
    robustness,
    preferenceFit: Number(intel?.components?.preferences ?? 50),
    diversity: diversityScore,
    openingFeasibility,
  });
  const stability = scenarioRobustness(decision.score, Number(profile?.confidence?.uncertaintyBand ?? 20));
  return { score: decision.score * 0.82 + stability.robustness * 0.18, decision, robustness: stability };
}

async function optimizeItinerary(places, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const maxStops = Math.max(1, Math.min(12, Number(options.maxStops) || 8));
  const endMin = Number.isFinite(options.endMin) ? options.endMin : 21 * 60;
  const startMin = Number.isFinite(options.startMin) ? options.startMin : getISTParts(now).minutesOfDay;
  const bufferMin = Number.isFinite(options.bufferMin) ? options.bufferMin : 15;
  const beamWidth = Math.max(3, Math.min(12, Number(options.beamWidth) || 8));
  const weather = options.weather || null;
  const origin = options.originCoords || null;
  const candidates = (places || []).filter((p) => Array.isArray(p.coords) && p.coords.length >= 2).slice(0, 40);
  if (!candidates.length) return { stops: [], score: 0, warnings: ['No geocoded candidate places available.'], algorithm: 'geo-temporal-beam-search-v3-robust' };

  const cache = new Map();
  const profileFor = async (place) => {
    const key = String(place.id || place.name);
    if (!cache.has(key)) {
      cache.set(key, buildTemporalProfile(place, { referenceDate: now, weather, stepMin: 30, horizonMin: 24 * 60, intelOptions: { personas: options.personas || [], tripMode: options.tripMode || null, region: options.region || null } }));
    }
    return cache.get(key);
  };

  let beam = [{ cursor: startMin, prevCoords: origin, stops: [], totalScore: 0, totalTravel: 0 }];
  const used = new Set();

  for (let depth = 0; depth < maxStops; depth += 1) {
    const next = [];
    for (const state of beam) {
      for (const place of candidates) {
        const key = String(place.id || place.name);
        if (state.stops.some((s) => s.key === key)) continue;
        const travel = estimateTravel({ fromCoords: state.prevCoords, toCoords: place.coords, departMin: state.cursor, isFirstStop: state.stops.length === 0 });
        const rawArrival = state.cursor + (travel.travelMinutes || 15);
        const arrivalDate = new Date(now.getTime() + (rawArrival - startMin) * 60 * 1000);
        let intel = null;
        try {
          intel = getTravelIntelligence(place, arrivalDate, weather, { fromCoords: state.prevCoords, personas: options.personas || [], tripMode: options.tripMode || null, region: options.region || null, disableExperienceWindows: false, isFirstStop: state.stops.length === 0 });
        } catch (_e) { continue; }
        const profile = await profileFor(place);
        const targetWindow = chooseTargetWindow(profile, rawArrival, endMin);
        const fit = fitToWindow(rawArrival, targetWindow);
        const actualArrival = rawArrival + fit.wait;
        const stay = visitMinutes(place);
        const leave = actualArrival + stay;
        if (actualArrival < startMin || leave > endMin) continue;
        if (intel.isOpenNow === false && fit.wait === 0) continue;
        const scored = scoreCandidate({ intel, arrivalMin: rawArrival, timingFit: fit.fit, travel, place, state, profile });
        const score = scored.score;
        next.push({
          cursor: leave + bufferMin,
          prevCoords: place.coords,
          totalScore: state.totalScore + score,
          totalTravel: state.totalTravel + (travel.travelMinutes || 0),
          stops: [...state.stops, {
            key,
            id: place.id || place.name,
            name: place.name,
            category: place.cat || intel.category || 'default',
            coords: place.coords,
            departAt: m2t(state.cursor),
            travelMinutes: travel.travelMinutes,
            travelSource: travel.source,
            distanceKm: travel.distanceKm,
            rawArrivalAt: m2t(rawArrival),
            arriveAt: m2t(actualArrival),
            waitingMinutes: fit.wait,
            leaveAt: m2t(leave),
            stayMinutes: stay,
            visitScore: intel.visitScore,
            timingFit: Math.round(fit.fit),
            optimizationScore: Math.round(score),
            decisionScore: scored.decision?.score ?? Math.round(score),
            decisionComponents: scored.decision?.components || null,
            robustness: scored.robustness || null,
            temporalOpportunity: profile.temporalOpportunity || null,
            scheduleRisk: Math.round(Math.max(0, 100 - fit.fit)),
            bestWindow: targetWindow,
            temporalModes: profile.modes,
            temporalConfidence: profile.confidence,
            temporalDayKey: targetWindow?.dayKey || null,
            crowd: intel.crowd,
            weather: intel.weather,
            traffic: intel.traffic,
            scenic: intel.scenic,
            confidence: intel.confidence,
            explanation: intel.explanation,
            sourceState: { computedAt: intel.computedAt, dataSources: intel.dataSources },
          }],
        });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.totalScore - a.totalScore || a.totalTravel - b.totalTravel);
    beam = next.slice(0, beamWidth);
    if (beam[0]?.stops.length) used.add(beam[0].stops[beam[0].stops.length - 1].key);
  }

  const best = beam.sort((a, b) => b.totalScore - a.totalScore || a.totalTravel - b.totalTravel)[0] || { stops: [], totalScore: 0, totalTravel: 0 };
  const topAlternatives = candidates
    .filter((p) => !best.stops.some((s) => s.key === String(p.id || p.name)))
    .slice(0, 5)
    .map((p) => ({ name: p.name, category: p.cat || 'default', reason: 'Not selected in the highest-scoring beam path; re-evaluate if trip state changes.' }));

  return {
    generatedAt: new Date().toISOString(),
    referenceTime: now.toISOString(),
    algorithm: 'geo-temporal-beam-search-v3-robust',
    objective: 'maximize robust experience at projected arrival time while balancing temporal opportunity, route efficiency, uncertainty, preferences, diversity, opening feasibility, weather, crowd and scenic windows',
    temporalResolutionMinutes: 30,
    stopCount: best.stops.length,
    totalScore: Math.round(best.totalScore),
    totalTravelMinutes: Math.round(best.totalTravel),
    stops: best.stops,
    warnings: best.stops.some((s) => s.waitingMinutes > 0) ? ['Some stops include waiting to preserve higher-value experience windows.'] : [],
    replanning: { supported: true, nextDecisionAt: best.stops[0]?.arriveAt || null, triggers: ['delay', 'weather_change', 'crowd_change', 'route_change', 'user_change'] },
    alternatives: topAlternatives,
    optimizationDiagnostics: { beamWidth, maxStops, startMin, endMin, bufferMin, objectiveWeights: { experience: 0.33, timing: 0.20, route: 0.13, robustness: 0.12, preference: 0.09, diversity: 0.05, opening: 0.08 }, decisionModel: 'multi-objective-robust-geo-temporal-v3' },
    dataQuality: {
      weather: [...new Set(best.stops.flatMap((s) => s.weather?.source || 'unavailable'))],
      crowd: [...new Set(best.stops.map((s) => s.crowd?.source || 'unavailable'))],
      traffic: [...new Set(best.stops.map((s) => s.traffic?.source || 'unavailable'))],
    },
  };
}

async function replanItinerary(remainingPlaces, options = {}) {
  const result = await optimizeItinerary(remainingPlaces, { ...options, maxStops: options.maxStops || 6 });
  return {
    ...result,
    replannedAt: new Date().toISOString(),
    trigger: options.trigger || 'user_requested',
    reason: options.reason || 'Itinerary recalculated from the current state.',
  };
}

module.exports = { optimizeItinerary, replanItinerary };
