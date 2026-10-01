/**
 * frontend/app-src/src/modules/whatIfSimulatorUi.js
 *
 * Next-Gen Interactive What-If Scenario Simulator UI for India In-Time v3.0.
 * Allows travelers to test counterfactual scenarios (climate pivots, ghat downpours,
 * severe heat waves, winter smog AQI spikes, and pacing lags) with real-time recalculation
 * of safety scores, scenic values, traffic kinematics, and catch-up recovery.
 */

export function calculateWhatIfDelta({
  _currentPlan = null,
  timeShiftHours = 0,
  weatherMode = 'normal',
  pacingLagMinutes = 0,
  _budgetTier = 'balanced',
} = {}) {
  const baseScenic = Number(_currentPlan?.itineraryQualityScore ?? _currentPlan?.totalScore ?? 88);
  const baseTraffic = Number(_currentPlan?.totalTravelMinutes ?? 42);
  const baseCrowd = 65;
  const baseSafety = 95;

  let scenicScore = baseScenic;
  let trafficTimeMin = baseTraffic;
  let crowdLevel = baseCrowd;
  let safetyScore = baseSafety;
  let actionableGuidance = 'Schedule is well-balanced across traffic and scenic windows.';
  let adaptationStrategy = 'KEEP_PLAN';

  // 1. Time Shift Effects
  const shift = Number(timeShiftHours) || 0;
  if (shift === 2) {
    scenicScore += 8; // Catch Sunset Golden Hour
    trafficTimeMin = Math.max(10, trafficTimeMin - 10);
    crowdLevel = Math.max(10, crowdLevel - 15);
    actionableGuidance = 'Sunset alignment optimal: late afternoon lighting elevates scenic viewpoints.';
  } else if (shift === -1) {
    scenicScore += 4;
    trafficTimeMin = Math.max(10, trafficTimeMin - 6);
    crowdLevel = Math.max(10, crowdLevel - 8);
    actionableGuidance = 'Early departure beats morning highway congestion and temple queues.';
  }

  // 2. Weather & Indian Hazard Scenarios
  if (weatherMode === 'monsoon') {
    scenicScore += 6;
    trafficTimeMin += 8;
    safetyScore -= 10;
    actionableGuidance = 'Rain slows transit; swap outdoor viewpoints for covered craft pavilions & havelis.';
    adaptationStrategy = 'SHELTERED_HAVEN_SUBSTITUTION';
  } else if (weatherMode === 'ghat_downpour') {
    scenicScore -= 20;
    trafficTimeMin += 35;
    safetyScore -= 45;
    actionableGuidance = 'CRITICAL: Active Ghat landslide risk. Daylight mountain transit mandatory; reroute to sheltered valley havens.';
    adaptationStrategy = 'SAFETY_FIRST_GHAT_REROUTE';
  } else if (weatherMode === 'heat' || weatherMode === 'heat_wave') {
    scenicScore -= 12;
    trafficTimeMin = Math.max(10, trafficTimeMin - 5);
    crowdLevel = Math.max(10, crowdLevel - 15);
    safetyScore -= 25;
    actionableGuidance = 'Dangerous 42°C heat index. Midday outdoor activities replaced with air-conditioned museums & science domes.';
    adaptationStrategy = 'AIR_CONDITIONED_SANCTUARY';
  } else if (weatherMode === 'winter_smog') {
    scenicScore -= 18;
    crowdLevel += 5;
    safetyScore -= 30;
    actionableGuidance = 'Severe winter smog (AQI > 300). Filtered indoor art galleries & museums recommended over outdoor gardens.';
    adaptationStrategy = 'INDOOR_AQI_SHIELD';
  }

  // 3. Pacing Lag & Schedule Recovery
  const lag = Number(pacingLagMinutes) || 0;
  let recoverableMinutes = 0;
  if (lag > 15) {
    trafficTimeMin += lag;
    recoverableMinutes = Math.min(lag, Math.round(lag * 0.75));
    actionableGuidance += ` Smart Catch-Up can recover +${recoverableMinutes}m of ${lag}m delay without dropping highlights.`;
    if (adaptationStrategy === 'KEEP_PLAN') adaptationStrategy = 'PACING_RECOVERY';
  }

  return {
    scenicDelta: scenicScore - baseScenic,
    trafficDeltaMin: trafficTimeMin - baseTraffic,
    crowdDelta: crowdLevel - baseCrowd,
    safetyDelta: safetyScore - baseSafety,
    recoverableMinutes,
    actionableGuidance,
    adaptationStrategy,
    projectedScenicScore: scenicScore,
    projectedTrafficMin: trafficTimeMin,
    projectedCrowdLevel: crowdLevel,
    projectedSafetyScore: safetyScore,
  };
}

export function renderWhatIfModal() {
  return `
    <div id="what-if-modal" class="what-if-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="what-if-title">
      <div class="what-if-card" style="max-width:540px;">
        <div class="what-if-header">
          <div>
            <h3 id="what-if-title" style="margin:0;font-size:17px;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
              <span>⚡</span> <span>What-If Travel Simulator</span>
            </h3>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Real-time sensitivity analysis & adaptive counterfactual simulation</div>
          </div>
          <button data-action="closeWhatIfModal" aria-label="Close" style="background:none;border:none;color:var(--text-primary);font-size:24px;line-height:1;cursor:pointer;">&times;</button>
        </div>

        <div class="what-if-body">
          <div class="setting-card">
            <div class="setting-lbl">Shift Start Time</div>
            <select id="what-if-time-shift" class="city-select" data-action="onWhatIfParamChange">
              <option value="0">Current Schedule (No Shift)</option>
              <option value="-1">1 Hour Earlier (Beat morning rush)</option>
              <option value="2">2 Hours Later (Catch Sunset Golden Hour)</option>
            </select>
          </div>

          <div class="setting-card">
            <div class="setting-lbl">Climate & Hazard Simulation</div>
            <select id="what-if-weather-mode" class="city-select" data-action="onWhatIfParamChange">
              <option value="normal">Normal Forecast</option>
              <option value="monsoon">🌧️ Sudden Monsoon (Covered Heritage & Cafes)</option>
              <option value="ghat_downpour">⛰️ Ghat Downpour & Landslide Risk (Safety Reroute)</option>
              <option value="heat">☀️ Afternoon Heat Surge (AC Havens & Museums)</option>
              <option value="winter_smog">🌫️ Winter Smog / AQI > 300 Alert (Indoor Galleries)</option>
            </select>
          </div>

          <div class="setting-card">
            <div class="setting-lbl">Pacing Delay & Transit Strain</div>
            <select id="what-if-pacing-lag" class="city-select" data-action="onWhatIfParamChange">
              <option value="0">On Track (0 min lag)</option>
              <option value="20">+20 min Minor Delay (Buffer absorbed)</option>
              <option value="45">+45 min Heavy Delay (Activate Catch-Up Optimizer)</option>
              <option value="75">+75 min Critical Delay (Schedule compression)</option>
            </select>
          </div>

          <div class="what-if-diff-box">
            <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Projected Optimization Impact</div>
            <div class="diff-metrics-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
              <div class="diff-metric-card" style="padding:8px 4px;text-align:center;">
                <div class="diff-metric-label" style="font-size:10px;">Scenic</div>
                <div class="diff-metric-val diff-positive" id="what-if-scenic-val" style="font-size:14px;">+8%</div>
              </div>
              <div class="diff-metric-card" style="padding:8px 4px;text-align:center;">
                <div class="diff-metric-label" style="font-size:10px;">Traffic</div>
                <div class="diff-metric-val diff-positive" id="what-if-traffic-val" style="font-size:14px;">-10m</div>
              </div>
              <div class="diff-metric-card" style="padding:8px 4px;text-align:center;">
                <div class="diff-metric-label" style="font-size:10px;">Crowds</div>
                <div class="diff-metric-val diff-positive" id="what-if-crowd-val" style="font-size:14px;">-15%</div>
              </div>
              <div class="diff-metric-card" style="padding:8px 4px;text-align:center;">
                <div class="diff-metric-label" style="font-size:10px;">Safety</div>
                <div class="diff-metric-val diff-positive" id="what-if-safety-val" style="font-size:14px;">0%</div>
              </div>
            </div>

            <div id="what-if-guidance-box" style="margin-top:10px;background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px;border-left:3px solid #818cf8;">
              <div style="font-size:10px;font-weight:800;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.04em;">Guardian Actionable Guidance</div>
              <div id="what-if-guidance-val" style="font-size:11.5px;color:#cbd5e1;margin-top:2px;line-height:1.4;">
                Sunset alignment optimal: late afternoon lighting elevates scenic viewpoints.
              </div>
            </div>
          </div>

          <button class="btn-gen" data-action="applyWhatIfSimulation" style="width:100%;margin-top:6px;">
            <span>Apply Simulation to Trip</span> <span>✨</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
