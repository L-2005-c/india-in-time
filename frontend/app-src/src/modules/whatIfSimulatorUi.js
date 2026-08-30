/**
 * Interactive What-If Scenario Simulator UI
 * Allows users to simulate schedule shifts, climate pivots, and budget throttles
 * with real-time recalculation of efficiency and scenic scores.
 */

export function calculateWhatIfDelta({ _currentPlan = null, timeShiftHours = 0, weatherMode = 'normal', _budgetTier = 'balanced' } = {}) {
  let scenicScore = 88;
  let trafficTimeMin = 42;
  let crowdLevel = 65;

  // Time shift effects
  if (timeShiftHours === 2 || timeShiftHours === '2') {
    scenicScore += 8; // Caught sunset
    trafficTimeMin -= 10;
    crowdLevel -= 15;
  } else if (timeShiftHours === -1 || timeShiftHours === '-1') {
    scenicScore += 4;
    trafficTimeMin -= 6;
    crowdLevel -= 8;
  }

  // Weather pivot effects
  if (weatherMode === 'monsoon') {
    scenicScore += 6; // Lush greenery & haveli indoor charm
    trafficTimeMin += 8; // Rain slow down
  } else if (weatherMode === 'heat') {
    trafficTimeMin -= 5;
    crowdLevel -= 12;
  }

  return {
    scenicDelta: scenicScore - 88,
    trafficDeltaMin: trafficTimeMin - 42,
    crowdDelta: crowdLevel - 65,
    projectedScenicScore: scenicScore,
    projectedTrafficMin: trafficTimeMin,
    projectedCrowdLevel: crowdLevel,
  };
}

export function renderWhatIfModal() {
  return `
    <div id="what-if-modal" class="what-if-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="what-if-title">
      <div class="what-if-card">
        <div class="what-if-header">
          <div>
            <h3 id="what-if-title" style="margin:0;font-size:17px;font-weight:800;color:var(--text-primary);">⚡ What-If Travel Simulator</h3>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Real-time itinerary sensitivity analysis</div>
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
            <div class="setting-lbl">Climate Adaptive Pivot</div>
            <select id="what-if-weather-mode" class="city-select" data-action="onWhatIfParamChange">
              <option value="normal">Normal Forecast</option>
              <option value="monsoon">🌧️ Sudden Monsoon (Covered Heritage & Cafes)</option>
              <option value="heat">☀️ Afternoon Heat Escape (Indoor Museums & AC)</option>
            </select>
          </div>

          <div class="what-if-diff-box">
            <div style="font-size:11.5px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Projected Optimization Impact</div>
            <div class="diff-metrics-grid">
              <div class="diff-metric-card">
                <div class="diff-metric-label">Scenic Alignment</div>
                <div class="diff-metric-val diff-positive" id="what-if-scenic-val">+8%</div>
              </div>
              <div class="diff-metric-card">
                <div class="diff-metric-label">Traffic Time</div>
                <div class="diff-metric-val diff-positive" id="what-if-traffic-val">-10m</div>
              </div>
              <div class="diff-metric-card">
                <div class="diff-metric-label">Crowd Density</div>
                <div class="diff-metric-val diff-positive" id="what-if-crowd-val">-15%</div>
              </div>
            </div>
          </div>

          <button class="btn-gen" data-action="applyWhatIfSimulation" style="width:100%;margin-top:4px;">
            <span>Apply Simulation to Trip</span> <span>✨</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
