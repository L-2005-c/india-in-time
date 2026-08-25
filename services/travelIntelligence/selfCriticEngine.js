'use strict';

/**
 * services/travelIntelligence/selfCriticEngine.js
 * Comprehensive Itinerary Self-Criticism, Validation, and Multi-Objective Quality Scoring.
 * Pipeline: GENERATE → CRITIQUE → FIND PROBLEMS → REPAIR → VALIDATE → DELIVER.
 */

const { evaluateBacktrackingPenalty } = require('./proximityGraph');
const { calculateSolarTimes, classifyTimePhase } = require('./astronomyTime');

/**
 * Evaluates an itinerary candidate against all architectural quality dimensions.
 * Returns { passed, overallQualityScore, breakdown, issues, repairs, canDeliver }.
 */
function critiqueItinerary(plan, requirements = {}, options = {}) {
  const stops = Array.isArray(plan?.stops) ? plan.stops : [];
  const hard = requirements.hard || {};
  const soft = requirements.soft || {};
  const weather = requirements.weather || {};

  const issues = [];
  const repairs = [];

  if (!stops.length) {
    return {
      passed: false,
      overallQualityScore: 0,
      breakdown: {
        requirementMatch: 0,
        timeOptimization: 0,
        routeEfficiency: 0,
        weatherCompatibility: 0,
        climateComfort: 0,
        scenicTiming: 0,
        crowdOptimization: 0,
        tourismQuality: 0,
        travelComfort: 0,
      },
      issues: ['Itinerary has 0 stops.'],
      repairs: [],
      canDeliver: false,
    };
  }

  // ── Dimension 1: Requirement Match (0-100) ─────────────────────────────
  let reqScore = 100;
  const preferred = soft.preferredCategories || [];
  const stopCats = new Set(stops.map(s => String(s.category || s.cat || '').toLowerCase()));
  if (preferred.length) {
    const met = preferred.filter(p => stopCats.has(p));
    reqScore = Math.round((met.length / preferred.length) * 100);
    if (met.length < preferred.length) {
      issues.push(`Unmet preferred categories: ${preferred.filter(p => !stopCats.has(p)).join(', ')}`);
    }
  }

  const mustVisit = hard.mustVisit || [];
  if (mustVisit.length) {
    const missingMust = mustVisit.filter(m => !stops.some(s => String(s.name || '').toLowerCase().includes(m.toLowerCase())));
    if (missingMust.length) {
      reqScore = Math.max(0, reqScore - (missingMust.length * 35));
      issues.push(`Missing mandatory must-visit places: ${missingMust.join(', ')}`);
    }
  }

  // ── Dimension 2: Time Optimization & Sequencing (0-100) ─────────────────
  let timeScore = 95;
  let prevLeave = hard.startMin || 0;
  const seenIds = new Set();

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const arrive = typeof s.arriveMin === 'number' ? s.arriveMin : 0;
    const leave = typeof s.leaveMin === 'number' ? s.leaveMin : arrive + (s.stayMinutes || 45);

    // Duplicate check
    const id = String(s.id || s.name).toLowerCase();
    if (seenIds.has(id)) {
      timeScore -= 30;
      issues.push(`Duplicate stop detected: ${s.name}`);
    }
    seenIds.add(id);

    // Timing order check
    if (arrive < prevLeave && i > 0) {
      timeScore -= 40;
      issues.push(`Chronological ordering violation at ${s.name} (arrives before previous departure)`);
    }

    // Opening hours check
    if (s.open === false) {
      timeScore -= 35;
      issues.push(`${s.name} is closed at projected arrival time (${s.arriveAt || arrive})`);
    }

    prevLeave = leave;
  }

  // ── Dimension 3: Route Efficiency & Backtracking (0-100) ─────────────────
  let routeScore = 95;
  let totalBacktrackPenalty = 0;

  for (let i = 2; i < stops.length; i++) {
    const p1 = stops[i - 2].coords;
    const p2 = stops[i - 1].coords;
    const p3 = stops[i].coords;
    if (p1 && p2 && p3) {
      const penalty = evaluateBacktrackingPenalty(p1, p2, p3);
      if (penalty > 0) {
        totalBacktrackPenalty += penalty;
        issues.push(`Directional backtracking detected between ${stops[i - 2].name} → ${stops[i - 1].name} → ${stops[i].name}`);
      }
    }
  }
  routeScore = Math.max(20, routeScore - totalBacktrackPenalty);

  // Long hop check
  const longHops = stops.filter(s => Number(s.distanceKm) > 18);
  if (longHops.length > 1) {
    routeScore -= (longHops.length * 10);
    issues.push(`Multiple long cross-city hops (> 18 km) detected`);
  }

  // ── Dimension 4 & 5: Weather & Climate Comfort (0-100) ──────────────────
  let wxScore = 90;
  let climateScore = 90;
  const tempC = Number(weather.tempC ?? 28);
  const isRaining = /rain|storm|drizzle/i.test(weather.condition || '');

  stops.forEach(s => {
    const isOutdoor = !['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping', 'nightlife'].includes(String(s.category || s.cat).toLowerCase());
    const arrive = s.arriveMin || 0;
    const isMiddayHeat = arrive >= 12 * 60 && arrive <= 15 * 60 + 30;

    if (tempC >= 35 && isMiddayHeat && isOutdoor) {
      climateScore -= 20;
      issues.push(`Outdoor stop ${s.name} scheduled during peak midday scorch (${tempC}°C)`);
    }

    if (isRaining && isOutdoor) {
      wxScore -= 18;
      issues.push(`Outdoor stop ${s.name} scheduled during active rainfall`);
    }
  });
  wxScore = Math.max(20, Math.min(100, wxScore));
  climateScore = Math.max(20, Math.min(100, climateScore));

  // ── Dimension 6: Scenic Timing & Astronomy (0-100) ───────────────────────
  let scenicScore = 92;
  stops.forEach(s => {
    const coords = s.coords || [17.6868, 83.2185];
    const solarTimes = calculateSolarTimes(coords[0], coords[1], options.now || new Date());
    const arrive = s.arriveMin || 0;
    const phaseInfo = classifyTimePhase(arrive, solarTimes);

    if (s.is_sunset_spot && phaseInfo.phase !== 'GOLDEN_HOUR' && phaseInfo.phase !== 'BLUE_HOUR') {
      if (arrive >= 11 * 60 && arrive <= 15 * 60) {
        scenicScore -= 25;
        issues.push(`Sunset highlight ${s.name} scheduled at midday under harsh overhead glare`);
      }
    }
  });
  scenicScore = Math.max(30, Math.min(100, scenicScore));

  // ── Dimension 7: Crowd Optimization (0-100) ─────────────────────────────
  let crowdScore = 88;
  const highCrowdStops = stops.filter(s => ['High', 'Very High'].includes(s.crowdLevel));
  if (soft.lowCrowd && highCrowdStops.length > 0) {
    crowdScore -= (highCrowdStops.length * 20);
    issues.push(`High crowd stops included despite low-crowd preference: ${highCrowdStops.map(s => s.name).join(', ')}`);
  }

  // ── Dimension 8: Tourism Quality (0-100) ─────────────────────────────────
  let tourismScore = 95;
  stops.forEach(s => {
    if (s.tourismTier === 'C') tourismScore -= 10;
    if (s.tourismTier === 'REJECT') {
      tourismScore -= 50;
      issues.push(`Non-tourist entity present in itinerary: ${s.name}`);
    }
  });
  tourismScore = Math.max(10, Math.min(100, tourismScore));

  // ── Dimension 9: Travel Comfort & Buffering (0-100) ───────────────────────
  let comfortScore = 92;
  const zeroWaitStops = stops.filter(s => Number(s.travelMinutes) > 40);
  if (zeroWaitStops.length >= 2) {
    comfortScore -= 15;
    issues.push('Multiple exhausting 40+ minute driving legs without rest buffer');
  }

  // ── Compute Overall Weighted Itinerary Quality Score (0-100) ────────────
  const breakdown = {
    requirementMatch: Math.max(0, Math.min(100, reqScore)),
    timeOptimization: Math.max(0, Math.min(100, timeScore)),
    routeEfficiency: Math.max(0, Math.min(100, routeScore)),
    weatherCompatibility: Math.max(0, Math.min(100, wxScore)),
    climateComfort: Math.max(0, Math.min(100, climateScore)),
    scenicTiming: Math.max(0, Math.min(100, scenicScore)),
    crowdOptimization: Math.max(0, Math.min(100, crowdScore)),
    tourismQuality: Math.max(0, Math.min(100, tourismScore)),
    travelComfort: Math.max(0, Math.min(100, comfortScore)),
  };

  const overallQualityScore = Math.round(
    breakdown.requirementMatch * 0.20 +
    breakdown.timeOptimization * 0.18 +
    breakdown.routeEfficiency * 0.14 +
    breakdown.weatherCompatibility * 0.10 +
    breakdown.climateComfort * 0.10 +
    breakdown.scenicTiming * 0.10 +
    breakdown.tourismQuality * 0.08 +
    breakdown.crowdOptimization * 0.05 +
    breakdown.travelComfort * 0.05
  );

  const passed = overallQualityScore >= 75 && breakdown.timeOptimization >= 60 && !issues.some(i => i.includes('Non-tourist entity'));

  return {
    passed,
    overallQualityScore,
    breakdown,
    issues,
    repairs,
    canDeliver: passed,
    summary: passed
      ? `Itinerary passed self-criticism evaluation with a quality score of ${overallQualityScore}/100.`
      : `Itinerary quality score (${overallQualityScore}/100) is below target threshold. Found ${issues.length} critique issues.`,
  };
}

module.exports = {
  critiqueItinerary,
};
