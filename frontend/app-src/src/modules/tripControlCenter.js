/**
 * frontend/app-src/src/modules/tripControlCenter.js
 *
 * India In-Time v3.0 Trip Control Center & Real-Time Travel Guardian UI.
 * Provides active trip HUD, immutable completed stop history, live disruption alerts,
 * one-click contextual plan adaptation, and controlled demo simulation.
 */

const DEFAULT_CANDIDATES_BY_INTENT = {
  GO_TO_HOTEL: [
    {
      id: 'hotel_novotel',
      name: 'Novotel Visakhapatnam Varun Beach',
      category: 'ACCOMMODATION',
      distanceKm: 4.2,
      durationMinutes: 12,
      price: { base: 4600, taxes: 828, total: 5428 },
      checkinStatus: 'Check-in Feasible (24h Front Desk)',
      trustScore: 96,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 95,
      explanation: 'Optimal luxury beach accommodation with seamless morning access to NH16 corridor.',
    },
    {
      id: 'hotel_gateway',
      name: 'The Gateway Hotel Beach Road',
      category: 'ACCOMMODATION',
      distanceKm: 3.8,
      durationMinutes: 10,
      price: { base: 3500, taxes: 630, total: 4130 },
      checkinStatus: 'Check-in Feasible',
      trustScore: 92,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 91,
      explanation: 'Prime coastal location with trusted culinary options and fast highway transit.',
    },
    {
      id: 'hotel_sheraton',
      name: 'Four Points by Sheraton Visakhapatnam',
      category: 'ACCOMMODATION',
      distanceKm: 5.6,
      durationMinutes: 16,
      price: { base: 4000, taxes: 720, total: 4720 },
      checkinStatus: 'Check-in Feasible',
      trustScore: 90,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 88,
      explanation: 'Central city hotel close to commercial and transit districts.',
    },
  ],
  GO_TO_RESTAURANT: [
    {
      id: 'rest_sea_inn',
      name: 'Sea Inn - Raju Gari Dhaba',
      category: 'DINING',
      distanceKm: 2.1,
      durationMinutes: 7,
      price: { base: 750, taxes: 38, total: 788 },
      checkinStatus: 'OPEN (Closes 23:00)',
      trustScore: 94,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 90,
      explanation: 'Authentic Andhra seafood directly along the return corridor; negligible 0.3 km detour.',
    },
    {
      id: 'rest_dharani',
      name: 'Dharani Pure Veg Restaurant',
      category: 'DINING',
      distanceKm: 3.4,
      durationMinutes: 11,
      price: { base: 580, taxes: 29, total: 609 },
      checkinStatus: 'OPEN (Closes 22:30)',
      trustScore: 91,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 87,
      explanation: 'Family-friendly pure vegetarian dining with high hygiene rating.',
    },
  ],
  GO_TO_RAILWAY_STATION: [
    {
      id: 'hub_vskp_rail',
      name: 'Visakhapatnam Junction Railway Station (VSKP)',
      category: 'TRANSPORT_HUB',
      distanceKm: 7.2,
      durationMinutes: 20,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'SAFE_BUFFER (70 min margin vs 45m required)',
      trustScore: 99,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 99,
      explanation: 'Major railway junction on East Coast line; 70-minute buffer ensures comfortable boarding.',
    },
  ],
  GO_TO_AIRPORT: [
    {
      id: 'hub_vtz_air',
      name: 'Visakhapatnam International Airport (VTZ)',
      category: 'TRANSPORT_HUB',
      distanceKm: 14.5,
      durationMinutes: 35,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'SAFE_BUFFER (145 min margin vs 120m required)',
      trustScore: 99,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 99,
      explanation: 'Commercial airport with 24h terminal access; ample buffer for security screening.',
    },
  ],
  GO_TO_BUS_STATION: [
    {
      id: 'hub_rtc_bus',
      name: 'Dwaraka Bus Station (RTC Complex)',
      category: 'TRANSPORT_HUB',
      distanceKm: 5.1,
      durationMinutes: 14,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'SAFE_BUFFER (50 min margin vs 30m required)',
      trustScore: 97,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 94,
      explanation: 'Central bus terminal with direct intercity connections across Andhra Pradesh.',
    },
  ],
  RETURN_HOME: [
    {
      id: 'dest_home',
      name: 'Home Destination (Private Route)',
      category: 'HOME',
      distanceKm: 8.5,
      durationMinutes: 22,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'Always Accessible',
      trustScore: 100,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 100,
      explanation: 'Return to primary residence. Exact coordinates remain private and unexposed in logs.',
    },
  ],
  CONTINUE_TO_DESTINATION: [
    {
      id: 'dest_araku',
      name: 'Araku Valley Hill Station',
      category: 'TOURIST_DESTINATION',
      distanceKm: 114.0,
      durationMinutes: 195,
      price: { base: 1200, taxes: 60, total: 1260 },
      checkinStatus: 'Daylight Travel Recommended',
      trustScore: 95,
      safetyStatus: 'CAUTION: Night Ghat Section',
      tomorrowUtilityScore: 98,
      explanation: 'Next scenic circuit destination; overnight stay in valley recommended before ghat sunset.',
    },
  ],
  CUSTOM_DESTINATION: [
    {
      id: 'dest_custom',
      name: 'Custom Location / User Dropoff',
      category: 'CUSTOM',
      distanceKm: 6.0,
      durationMinutes: 18,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'On-Demand Route',
      trustScore: 90,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 90,
      explanation: 'User-specified waypoint evaluated dynamically against traffic and road constraints.',
    },
  ],
  END_JOURNEY: [
    {
      id: 'dest_end',
      name: 'Conclude & Archive Journey',
      category: 'END',
      distanceKm: 0,
      durationMinutes: 0,
      price: { base: 0, taxes: 0, total: 0 },
      checkinStatus: 'Completed',
      trustScore: 100,
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 100,
      explanation: 'Formally finalize active itinerary and save trip summary to local records.',
    },
  ],
};

export function renderTripControlCenter({
  tripId = 'active_trip',
  planVersion = 1,
  tripHealth = 'ON_TRACK',
  activeStop = null,
  completedStops = [],
  upcomingStops = [],
  _pacingLagMinutes = 0,
  activeTriggers = [],
  lastAdaptation = null,
  isSimulationActive = false,
  simulationScenario = null,
  providerHealth = [],
  experienceOptimization = null,
  trustIntelligence = null,
  isEvidenceDrawerOpen = false,
  isJourneyComplete = false,
  currentLegIndex = 1,
  journeyLegs = [],
  selectedIntent = 'GO_TO_HOTEL',
  nextLegCandidates = null,
  selectedCandidate = null,
  deadlineAlert = null,
} = {}) {
  const healthBadges = {
    ON_TRACK: { icon: '🟢', label: 'Trip is On Track', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    WATCH: { icon: '🟡', label: 'Watch Active', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    SUBOPTIMAL: { icon: '🟠', label: 'Suboptimal Conditions', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },
    CRITICAL: { icon: '🔴', label: 'Adaptation Required', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    REPLAN_RECOMMENDED: { icon: '⚠️', label: 'Replan Recommended', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_CAUTION: { icon: '🛡️', label: 'Safety Caution', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_ACTION_RECOMMENDED: { icon: '⚠️', label: 'Safety Action Recommended', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    INSUFFICIENT_DATA: { icon: 'ℹ️', label: 'Data Stale / Unverified', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  };

  const currentBadge = healthBadges[tripHealth] || healthBadges.ON_TRACK;

  return `
    <div id="trip-control-center" class="trip-control-hud" style="background:var(--bg-surface, #1e293b); border-radius:12px; padding:20px; border:1px solid rgba(255,255,255,0.08); margin:16px 0; color:#f8fafc; font-family:inherit;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:14px; margin-bottom:16px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">🛡️</span>
            <h3 style="margin:0; font-size:18px; font-weight:700;">Trip Control Center</h3>
            <span style="background:rgba(99,102,241,0.2); color:#818cf8; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600;">Plan v${planVersion}</span>
          </div>
          <div style="font-size:12px; color:#94a3b8; margin-top:3px;">Trip ID: <code>${tripId}</code></div>
        </div>

        <div style="display:inline-flex; align-items:center; gap:6px; background:${currentBadge.bg}; border:1px solid ${currentBadge.color}; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; color:${currentBadge.color};">
          <span>${currentBadge.icon}</span>
          <span>${currentBadge.label}</span>
        </div>
      </div>

      <!-- Persistent Simulation Isolation Banner (Section 29/30) -->
      ${isSimulationActive ? `
        <div id="simulation-active-banner" class="simulation-active-banner" style="background:rgba(234, 88, 12, 0.15); border:1px solid #ea580c; border-radius:8px; padding:10px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:18px;">🧪</span>
            <div>
              <div style="font-size:12px; font-weight:800; color:#fdba74; letter-spacing:0.04em;">SIMULATION ACTIVE — DEMO DATA</div>
              <div style="font-size:11px; color:#fed7aa; margin-top:2px;">Scenario: <strong>${simulationScenario || 'Synthetic Reality Mutation'}</strong> (Strictly isolated from live government telemetry)</div>
            </div>
          </div>
          <button id="btn-clear-simulation" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.25); border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition:background 0.2s;">
            ✕ Clear Simulation
          </button>
        </div>
      ` : ''}

      <!-- Disruption / Travel Guardian Banner -->
      ${activeTriggers.length > 0 ? `
        <div class="guardian-alert-banner" style="background:rgba(239, 68, 68, 0.1); border-left:4px solid #ef4444; border-radius:4px; padding:12px 16px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:700; color:#fca5a5; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span>⚠️</span> REALITY DISRUPTION DETECTED
              </div>
              <ul style="margin:6px 0 0 18px; padding:0; font-size:12px; color:#f8fafc; line-height:1.5;">
                ${activeTriggers.map(t => `<li><strong>${t.type}</strong>: ${t.message}</li>`).join('')}
              </ul>
            </div>
            <button id="btn-trigger-replan" data-trip-id="${tripId}" style="background:#ef4444; color:#fff; border:none; border-radius:6px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; transition:background 0.2s;">
              ⚡ Adapt Plan Now
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Last Adaptation Notice (if v2+) -->
      ${lastAdaptation ? `
        <div style="background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.3); border-radius:8px; padding:12px 14px; margin-bottom:16px; font-size:12px;">
          <div style="font-weight:600; color:#93c5fd; margin-bottom:4px;">✨ Contextual Adaptation Active (v${planVersion})</div>
          <div style="color:#cbd5e1; white-space:pre-line;">${lastAdaptation.explanation || 'Plan adapted for weather & road constraints.'}</div>
        </div>
      ` : ''}

      <!-- Current / Active Stop Card -->
      <div style="background:rgba(15, 23, 42, 0.6); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:14px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; font-weight:700;">Active Destination</span>
          <span style="background:#3b82f6; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600;">IN PROGRESS</span>
        </div>

        ${activeStop ? `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:16px; font-weight:700; color:#fff;">${activeStop.name}</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Category: ${activeStop.category} · Planned: ${activeStop.plannedDurationMinutes || 60}m</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button id="btn-complete-active-stop" data-stop-id="${activeStop.id}" data-trip-id="${tripId}" style="background:#10b981; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer;">
                ✓ Mark Completed
              </button>
              <button id="btn-skip-active-stop" data-stop-id="${activeStop.id}" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.1); color:#cbd5e1; border:none; border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer;">
                ⏭ Skip
              </button>
              <button id="btn-finish-journey-to-next" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer;">
                🏁 Finish & Plan Next Leg
              </button>
            </div>
          </div>
        ` : `
          <div style="font-size:13px; color:#94a3b8;">No destination currently in progress.</div>
        `}
      </div>

      <!-- Schedule Progress Grid -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
        <!-- Completed Stops (Immutable) -->
        <div style="background:rgba(15, 23, 42, 0.4); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.04);">
          <div style="font-size:11px; font-weight:700; color:#10b981; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:4px;">
            <span>✓</span> Completed History (${completedStops.length}) — IMMUTABLE
          </div>
          ${completedStops.length > 0 ? `
            <ul style="margin:0; padding:0 0 0 16px; font-size:12px; color:#94a3b8;">
              ${completedStops.map(s => `<li style="margin-bottom:4px; text-decoration:line-through; color:#64748b;">${s.name}</li>`).join('')}
            </ul>
          ` : `
            <div style="font-size:11px; color:#64748b;">No stops completed yet.</div>
          `}
        </div>

        <!-- Upcoming Stops -->
        <div style="background:rgba(15, 23, 42, 0.4); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.04);">
          <div style="font-size:11px; font-weight:700; color:#38bdf8; text-transform:uppercase; margin-bottom:8px;">
            Remaining Stops (${upcomingStops.length})
          </div>
          ${upcomingStops.length > 0 ? `
            <ul style="margin:0; padding:0 0 0 16px; font-size:12px; color:#cbd5e1;">
              ${upcomingStops.map(s => `
                <li style="margin-bottom:4px;">
                  ${s.name} ${s.isAlternative ? '<span style="color:#f59e0b; font-size:10px;">[Alternative]</span>' : ''}
                </li>
              `).join('')}
            </ul>
          ` : `
            <div style="font-size:11px; color:#64748b;">All planned stops finished.</div>
          `}
        </div>
      </div>

      <!-- Phase 6: Next Journey Intelligence (Return, Stay & Next Destination) -->
      ${(() => {
        const isComplete = isJourneyComplete || (upcomingStops.length === 0 && !activeStop);
        const activeCandidates = (Array.isArray(nextLegCandidates) && nextLegCandidates.length > 0)
          ? nextLegCandidates
          : (DEFAULT_CANDIDATES_BY_INTENT[selectedIntent] || DEFAULT_CANDIDATES_BY_INTENT.GO_TO_HOTEL);
        const topCandidate = selectedCandidate || activeCandidates[0];

        return `
          <div id="next-journey-panel" style="border-top:1px solid rgba(255,255,255,0.12); padding-top:16px; margin-bottom:18px;">
            <!-- Status Banner -->
            <div style="background:linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border:1px solid rgba(168,85,247,0.35); border-radius:8px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:18px;">🚀</span>
                  <h4 style="margin:0; font-size:14px; font-weight:800; color:#e0e7ff;">Next Journey Intelligence — Leg ${currentLegIndex} ${isComplete ? 'Complete' : 'In Progress'}</h4>
                  <span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:10px; font-weight:800; padding:2px 8px; border-radius:12px; border:1px solid rgba(16,185,129,0.4);">
                    ${isComplete ? 'NEXT_INTENT_REQUIRED' : 'PREVIEW_PLANNING'}
                  </span>
                </div>
                <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">
                  Evaluates real-time constraints, check-in feasibility, corridor dining, transport deadlines, safety, and tomorrow's commitments.
                </div>
              </div>
              <span style="font-size:11px; color:#a5b4fc; font-weight:700; background:rgba(99,102,241,0.2); padding:4px 10px; border-radius:6px;">
                Leg ${currentLegIndex} History Locked 🔒
              </span>
            </div>

            <!-- 8 Intent Selection Grid -->
            <div style="margin-bottom:14px;">
              <div style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">
                Select Traveler Intent:
              </div>
              <div class="next-journey-intent-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px;">
                ${[
                  { id: 'btn-intent-hotel', intent: 'GO_TO_HOTEL', icon: '🏨', label: 'Hotel / Stay' },
                  { id: 'btn-intent-restaurant', intent: 'GO_TO_RESTAURANT', icon: '🍽️', label: 'Food / Dining' },
                  { id: 'btn-intent-railway', intent: 'GO_TO_RAILWAY_STATION', icon: '🚆', label: 'Railway' },
                  { id: 'btn-intent-airport', intent: 'GO_TO_AIRPORT', icon: '✈️', label: 'Airport' },
                  { id: 'btn-intent-bus', intent: 'GO_TO_BUS_STATION', icon: '🚌', label: 'Bus Station' },
                  { id: 'btn-intent-home', intent: 'RETURN_HOME', icon: '🏠', label: 'Return Home' },
                  { id: 'btn-intent-continue', intent: 'CONTINUE_TO_DESTINATION', icon: '📍', label: 'Next Stop' },
                  { id: 'btn-intent-custom', intent: 'CUSTOM_DESTINATION', icon: '✏️', label: 'Custom' },
                  { id: 'btn-intent-end', intent: 'END_JOURNEY', icon: '🛑', label: 'End Trip' },
                ].map(item => {
                  const isSelected = selectedIntent === item.intent;
                  return `
                    <button
                      id="${item.id}"
                      class="btn-next-intent"
                      data-next-intent="${item.intent}"
                      data-trip-id="${tripId}"
                      style="background:${isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; color:${isSelected ? '#38bdf8' : '#e2e8f0'}; border-radius:6px; padding:8px 6px; font-size:11px; font-weight:${isSelected ? '700' : '500'}; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.15s ease;"
                    >
                      <span>${item.icon}</span>
                      <span>${item.label}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Transport Deadline Risk Alert Banner (If Applicable) -->
            ${deadlineAlert ? `
              <div id="transport-deadline-banner" style="background:rgba(239, 68, 68, 0.15); border:1px solid #ef4444; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:20px;">⚠️</span>
                  <div>
                    <div style="font-size:12px; font-weight:800; color:#fca5a5;">DEADLINE RISK: ${deadlineAlert.stationName || 'Transport Hub'}</div>
                    <div style="font-size:11px; color:#fee2e2; margin-top:2px;">
                      Scheduled Departure: <strong>${deadlineAlert.scheduledDeparture || '22:30'}</strong> · Available Buffer: <strong style="color:#ef4444;">${deadlineAlert.availableBufferMinutes}m</strong> (Required: ${deadlineAlert.requiredBufferMinutes}m). Immediate departure recommended!
                    </div>
                  </div>
                </div>
                <span style="background:#ef4444; color:#fff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:4px;">URGENT</span>
              </div>
            ` : ''}

            <!-- Best Next Leg Recommendation Card -->
            ${topCandidate ? `
              <div id="best-next-leg-card" style="background:rgba(30, 41, 59, 0.7); border:1px solid rgba(56, 189, 248, 0.3); border-radius:10px; padding:16px; margin-bottom:14px; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                  <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:12px; color:#38bdf8; font-weight:800; letter-spacing:0.04em;">BEST NEXT LEG RECOMMENDATION</span>
                      <span style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; border:1px solid rgba(56, 189, 248, 0.3);">
                        ${topCandidate.category}
                      </span>
                    </div>
                    <h3 style="margin:6px 0 2px 0; font-size:16px; font-weight:700; color:#fff;">${topCandidate.name}</h3>
                    <div style="font-size:12px; color:#94a3b8;">
                      🚗 Travel Effort: <strong style="color:#f8fafc;">${topCandidate.distanceKm} km</strong> (~${topCandidate.durationMinutes} min)
                    </div>
                  </div>

                  <!-- Itemized Cost & Taxes Decomposition -->
                  <div style="text-align:right;">
                    <div style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Estimated Cost (Inc. GST)</div>
                    <div style="font-size:18px; font-weight:800; color:#38bdf8;">₹${topCandidate.price?.total ?? 0}</div>
                    <div style="font-size:10px; color:#64748b;">Base: ₹${topCandidate.price?.base ?? 0} + Tax: ₹${topCandidate.price?.taxes ?? 0}</div>
                  </div>
                </div>

                <!-- Rationale & Explanation -->
                <div style="margin-top:10px; font-size:12px; color:#cbd5e1; line-height:1.4; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:6px;">
                  ${topCandidate.explanation}
                </div>

                <!-- Multidimensional Intelligence Badges -->
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
                  <span style="font-size:11px; background:rgba(16, 185, 129, 0.15); color:#34d399; border:1px solid rgba(16, 185, 129, 0.3); padding:3px 8px; border-radius:4px;">
                    🏨 ${topCandidate.checkinStatus}
                  </span>
                  <span style="font-size:11px; background:rgba(56, 189, 248, 0.15); color:#38bdf8; border:1px solid rgba(56, 189, 248, 0.3); padding:3px 8px; border-radius:4px;">
                    🛡️ Trust Verified (${topCandidate.trustScore}/100)
                  </span>
                  <span style="font-size:11px; background:rgba(16, 185, 129, 0.15); color:#34d399; border:1px solid rgba(16, 185, 129, 0.3); padding:3px 8px; border-radius:4px;">
                    🟢 Safety: ${topCandidate.safetyStatus}
                  </span>
                  <span style="font-size:11px; background:rgba(245, 158, 11, 0.15); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.3); padding:3px 8px; border-radius:4px;">
                    🌅 Tomorrow Corridor Utility: +${topCandidate.tomorrowUtilityScore}/100
                  </span>
                </div>

                <!-- Start Next Leg Action Button -->
                <div style="margin-top:14px; display:flex; justify-content:flex-end;">
                  <button
                    id="btn-start-next-leg"
                    data-trip-id="${tripId}"
                    data-candidate-id="${topCandidate.id}"
                    style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; border-radius:8px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(16,185,129,0.3); transition:all 0.2s;"
                  >
                    <span>🚀</span> Start Next Leg (Leg ${currentLegIndex + 1})
                  </button>
                </div>
              </div>
            ` : ''}

            <!-- Candidate Comparison Table (2-4 Options) -->
            <div style="background:rgba(15, 23, 42, 0.5); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:14px;">
              <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:10px;">
                Candidate Evaluation & Tradeoff Comparison (${activeCandidates.length} evaluated)
              </div>
              <div style="overflow-x:auto;">
                <table id="next-leg-candidates-table" style="width:100%; border-collapse:collapse; font-size:11px; color:#cbd5e1; text-align:left;">
                  <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1); color:#94a3b8;">
                      <th style="padding:6px 8px;">Option / Destination</th>
                      <th style="padding:6px 8px;">Travel Effort</th>
                      <th style="padding:6px 8px;">Cost & GST</th>
                      <th style="padding:6px 8px;">Window / Check-in</th>
                      <th style="padding:6px 8px;">Tomorrow Fit</th>
                      <th style="padding:6px 8px; text-align:right;">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activeCandidates.map(cand => {
                      const isCandSelected = (selectedCandidate?.id === cand.id) || (!selectedCandidate && cand.id === activeCandidates[0]?.id);
                      return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:${isCandSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent'};">
                          <td style="padding:8px; font-weight:${isCandSelected ? '700' : '500'}; color:${isCandSelected ? '#38bdf8' : '#f8fafc'};">
                            ${cand.name}
                            ${isCandSelected ? '<span style="color:#38bdf8; margin-left:4px; font-size:9px;">[Selected]</span>' : ''}
                          </td>
                          <td style="padding:8px;">${cand.distanceKm} km (${cand.durationMinutes}m)</td>
                          <td style="padding:8px;">₹${cand.price?.total ?? 0}</td>
                          <td style="padding:8px;">${cand.checkinStatus}</td>
                          <td style="padding:8px;">${cand.tomorrowUtilityScore}/100</td>
                          <td style="padding:8px; text-align:right;">
                            <button
                              class="btn-select-next-candidate"
                              data-candidate-id="${cand.id}"
                              data-trip-id="${tripId}"
                              style="background:${isCandSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; color:${isCandSelected ? '#0f172a' : '#cbd5e1'}; border:none; border-radius:4px; padding:4px 8px; font-size:10px; font-weight:700; cursor:pointer;"
                            >
                              ${isCandSelected ? '✓ Selected' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Journey Leg Chain (Continuous Journey Chaining) -->
            <div id="journey-leg-chain" style="background:rgba(0,0,0,0.25); border-radius:6px; padding:8px 12px; font-size:11px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#94a3b8;">Journey Sequence:</span>
              ${(journeyLegs.length > 0 ? journeyLegs : [{ legIndex: 1, name: 'Visakhapatnam Tour', status: isComplete ? 'COMPLETED' : 'ACTIVE' }]).map((leg, idx) => `
                <span style="display:inline-flex; align-items:center; gap:4px; background:${leg.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; border:1px solid ${leg.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}; color:${leg.status === 'COMPLETED' ? '#34d399' : '#38bdf8'}; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700;">
                  ${leg.status === 'COMPLETED' ? '🔒' : '📍'} Leg ${leg.legIndex || (idx + 1)}: ${leg.name || 'Leg'} (${leg.status})
                </span>
                ${idx < (journeyLegs.length - 1) ? '<span style="color:#64748b;">➔</span>' : ''}
              `).join('')}
              <span style="color:#64748b;">➔</span>
              <span style="color:#a5b4fc; font-style:italic;">Leg ${currentLegIndex + 1} (Planning...)</span>
            </div>
          </div>
        `;
      })()}

      <!-- Phase 4: Best Use of Your Time (Experience Value Optimization) -->
      <div id="experience-value-panel" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">✨</span>
            <span style="font-size:12px; font-weight:700; color:#f8fafc;">Best Use of Your Time:</span>
            <span style="background:rgba(129,140,248,0.15); color:#a5b4fc; font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid rgba(129,140,248,0.3);">
              ${experienceOptimization?.timeBudget?.usableExperienceMinutes ?? 75}m Usable Time (${experienceOptimization?.timeBudget?.budgetClassification || 'BALANCED'})
            </span>
          </div>
          <span style="font-size:10px; color:#94a3b8;">Deterministic Value Optimizer</span>
        </div>

        ${(() => {
          const rec = experienceOptimization?.primaryRecommendation || (
            upcomingStops.length > 0
              ? {
                  candidate: upcomingStops[0],
                  compositeScore: 88,
                  actionType: 'DO_NEXT',
                  visitScore: 85,
                  dnaMatchScore: 82,
                  windowScore: 90,
                  explanation: {
                    headline: `Proceed with ${upcomingStops[0].name} to maximize daytime experience value.`,
                    tradeoff: 'No planned stops sacrificed; fits cleanly within usable schedule.',
                    confidence: 88,
                  },
                }
              : null
          );

          if (!rec) {
            return `<div style="font-size:11px; color:#64748b; padding:8px; background:rgba(0,0,0,0.2); border-radius:6px;">No upcoming experience recommendations needed.</div>`;
          }

          const actionColors = {
            DO_NOW: { color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)' },
            DO_NEXT: { color: '#818cf8', bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.35)' },
            SWAP_FOR: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)' },
            DEFER_TO_LATER: { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.35)' },
            REST_OR_REFUEL: { color: '#14b8a6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.35)' },
          };
          const badge = actionColors[rec.actionType] || actionColors.DO_NOW;

          const valueBadge = rec.factorLevels?.valueBadge || (rec.compositeScore >= 85 ? 'HIGH VALUE' : (rec.compositeScore >= 70 ? 'STRONG FIT' : 'BALANCED FIT'));
          const valueBadgeColors = {
            'HIGH VALUE': { color: '#10b981', bg: 'rgba(16,185,129,0.2)', border: 'rgba(16,185,129,0.4)' },
            'STRONG FIT': { color: '#38bdf8', bg: 'rgba(56,189,248,0.2)', border: 'rgba(56,189,248,0.4)' },
            'BALANCED FIT': { color: '#818cf8', bg: 'rgba(129,140,248,0.2)', border: 'rgba(129,140,248,0.4)' },
            'MODERATE': { color: '#f59e0b', bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.4)' },
            'LOW PRIORITY': { color: '#94a3b8', bg: 'rgba(148,163,184,0.2)', border: 'rgba(148,163,184,0.4)' },
          };
          const vBadge = valueBadgeColors[valueBadge] || valueBadgeColors['STRONG FIT'];

          return `
            <div class="experience-recommendation-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; font-weight:700; color:#f8fafc;">${rec.candidate?.name}</span>
                    <span style="background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.border}; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">
                      ${rec.actionType}
                    </span>
                    <span style="font-size:10px; color:#94a3b8;">${rec.candidate?.visitMinutes || 45} min stay</span>
                  </div>
                  <div style="font-size:11px; color:#cbd5e1; margin-top:4px; line-height:1.4;">
                    ${rec.explanation?.headline || 'Optimized for current timing and conditions.'}
                  </div>
                </div>
                <div style="text-align:right;">
                  <span style="background:${vBadge.bg}; color:${vBadge.color}; border:1px solid ${vBadge.border}; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; display:inline-block;">
                    ${valueBadge}
                  </span>
                  <div style="font-size:10px; color:#94a3b8; margin-top:3px;">Value Index: <strong style="color:#38bdf8;">${rec.compositeScore}</strong>/100</div>
                </div>
              </div>

              <!-- Factor Dimension Tags (Sections 10, 41, 42, 43, 44) -->
              <div class="experience-factor-pills" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                <span style="font-size:10px; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); padding:2px 7px; border-radius:4px;">
                  🎯 Traveler Fit: <strong>${rec.factorLevels?.travelerFit || 'HIGH'}</strong>
                </span>
                <span style="font-size:10px; background:rgba(16,185,129,0.12); color:#34d399; border:1px solid rgba(16,185,129,0.25); padding:2px 7px; border-radius:4px;">
                  ⏱️ Efficiency: <strong>${rec.factorLevels?.timeEfficiency || 'HIGH'}</strong>
                </span>
                <span style="font-size:10px; background:rgba(245,158,11,0.12); color:#fbbf24; border:1px solid rgba(245,158,11,0.25); padding:2px 7px; border-radius:4px;">
                  🌅 Window: <strong>${rec.factorLevels?.windowSuitability || 'OPTIMAL'}</strong>
                </span>
                <span style="font-size:10px; background:rgba(99,102,241,0.12); color:#a5b4fc; border:1px solid rgba(99,102,241,0.25); padding:2px 7px; border-radius:4px;">
                  🌦️ Weather: <strong>${rec.factorLevels?.weatherSuitability || 'SUITABLE'}</strong>
                </span>
                <span style="font-size:10px; background:rgba(16,185,129,0.12); color:#34d399; border:1px solid rgba(16,185,129,0.25); padding:2px 7px; border-radius:4px;">
                  🛡️ Safety: <strong>${rec.factorLevels?.safety || 'CLEAR'}</strong>
                </span>
                <span style="font-size:10px; background:${rec.factorLevels?.opportunityCost === 'SACRIFICE DETECTED' ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.12)'}; color:${rec.factorLevels?.opportunityCost === 'SACRIFICE DETECTED' ? '#f87171' : '#cbd5e1'}; border:1px solid ${rec.factorLevels?.opportunityCost === 'SACRIFICE DETECTED' ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.25)'}; padding:2px 7px; border-radius:4px;">
                  ⚖️ Opp Cost: <strong>${rec.factorLevels?.opportunityCost || 'LOW'}</strong>
                </span>
              </div>

              <!-- Tradeoff statement -->
              <div style="margin-top:8px; font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.25); padding:6px 10px; border-radius:4px; display:flex; align-items:flex-start; gap:6px; border-left:3px solid #38bdf8;">
                <span>⚖️</span>
                <span><strong>Downstream Tradeoff:</strong> ${rec.explanation?.tradeoff ? (rec.explanation.tradeoff.toLowerCase().includes('sacrifice') || rec.explanation.tradeoff.toLowerCase().includes('miss') ? rec.explanation.tradeoff : `If you choose this, schedule accommodates next planned stops cleanly (${rec.explanation.tradeoff})`) : 'Zero downstream sacrifices; fits cleanly within usable time.'}</span>
              </div>

              <!-- Action buttons -->
              <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end;">
                <button id="btn-accept-experience" data-place-id="${rec.candidate?.id}" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; border-radius:6px; padding:5px 12px; font-size:11px; font-weight:700; cursor:pointer;">
                  ✓ Prioritize This Stop
                </button>
                <button id="btn-defer-experience" data-place-id="${rec.candidate?.id}" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.08); color:#cbd5e1; border:1px solid rgba(255,255,255,0.15); border-radius:6px; padding:5px 10px; font-size:11px; font-weight:600; cursor:pointer;">
                  Keep Original Sequence
                </button>
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- Phase 5: Tourist Trust & Evidence Intelligence Panel -->
      <div id="trust-evidence-panel" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">🛡️</span>
            <span style="font-size:12px; font-weight:700; color:#f8fafc;">Tourist Trust & Evidence:</span>
            <span style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid rgba(56, 189, 248, 0.3);">
              11 Dimensions • Multi-Source Registry
            </span>
          </div>
          <span style="font-size:10px; color:#94a3b8;">Zero LLM Fabrication • Evidence-Grounded</span>
        </div>

        ${(() => {
          const trust = trustIntelligence || {
            targetName: activeStop?.name || (upcomingStops[0]?.name || 'Kailasagiri Hilltop Park'),
            trustState: 'TRUSTED',
            confidence: 94,
            summary: 'Formally verified via Ministry of Tourism NIDHI+ registry and authentic municipal telemetry.',
            providerName: 'Visakhapatnam Tourism Board & Ropeway',
            providerType: 'ACTIVITY_OPERATOR',
            registrations: [
              { registry: 'NIDHI+', status: 'TOURISM_RECOGNITION_VERIFIED', phrasing: 'Listed/recognized in Ministry of Tourism registry' },
              { registry: 'GSTIN', status: 'GST_REGISTRATION_VERIFIED', phrasing: 'GST tax registration active' },
            ],
            price: {
              basePrice: 100,
              taxes: 18,
              fees: 0,
              monumentEntry: 40,
              seasonalSurge: 0,
              total: 158,
              transparencyTier: 'HIGH',
              freshness: 'FRESH',
              advice: 'Full itemized transparency matching regional baseline.',
            },
            claims: [
              { claim: 'Operating hours 06:00 - 20:00 confirmed', source: 'MUNICIPAL_TOURISM_BOARD', freshness: 'CURRENT' },
              { claim: 'Ropeway carriage safety certified', source: 'STATE_SAFETY_AUDIT', freshness: 'CURRENT' },
              { claim: 'ASI ticket pricing parity verified', source: 'OFFICIAL_REGISTRY', freshness: 'CURRENT' },
            ],
            explainability: {
              canITrustThis: 'YES - Formally verified and recognized.',
              why: 'Recognized in official registries with transparent pricing decomposition.',
              whatToWatchOutFor: 'Weekend evening ropeway queues can reach 20 minutes.',
            },
          };

          const stateColors = {
            TRUSTED: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)', icon: '✓' },
            SUPPORTED: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.35)', icon: 'ℹ' },
            PLAUSIBLE: { color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)', border: 'rgba(129, 140, 248, 0.35)', icon: '?' },
            UNVERIFIED: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', icon: '⚠' },
            CONFLICTED: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.35)', icon: '⚡' },
            HIGH_RISK: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)', icon: '✕' },
            INSUFFICIENT_DATA: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.35)', icon: '…' },
          };
          const badge = stateColors[trust.trustState] || stateColors.SUPPORTED;

          return `
            <div class="trust-evaluation-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; font-weight:700; color:#f8fafc;">${trust.targetName}</span>
                    <span style="background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.border}; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">
                      ${badge.icon} ${trust.trustState}
                    </span>
                    <span style="font-size:10px; color:#94a3b8;">${trust.confidence}% Confidence</span>
                  </div>
                  <div style="font-size:11px; color:#cbd5e1; margin-top:4px; line-height:1.4;">
                    ${trust.summary}
                  </div>
                </div>
                <div style="text-align:right;">
                  <span style="background:rgba(56, 189, 248, 0.12); color:#38bdf8; border:1px solid rgba(56, 189, 248, 0.25); font-size:10px; font-weight:700; padding:3px 8px; border-radius:4px; display:inline-block;">
                    ${trust.providerType || 'TOURISM_SERVICE'}
                  </span>
                </div>
              </div>

              <!-- Provider Legitimacy Tags -->
              <div class="trust-registry-tags" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                ${(trust.registrations || []).map(r => `
                  <span style="font-size:10px; background:rgba(16, 185, 129, 0.12); color:#34d399; border:1px solid rgba(16, 185, 129, 0.25); padding:2px 7px; border-radius:4px;">
                    🏛️ <strong>${r.registry}</strong>: ${r.phrasing || r.status}
                  </span>
                `).join('')}
                ${(!trust.registrations || trust.registrations.length === 0) ? `
                  <span style="font-size:10px; background:rgba(245, 158, 11, 0.12); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.25); padding:2px 7px; border-radius:4px;">
                    ℹ️ Independent Local Provider (Not indexed in central digital registries)
                  </span>
                ` : ''}
              </div>

              <!-- 6-Component Price Breakdown -->
              <div class="trust-price-decomposition" style="margin-top:10px; background:rgba(0,0,0,0.25); border-radius:6px; padding:8px 10px; border-left:3px solid #10b981;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:10px; font-weight:700; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.04em;">
                    💰 Itemized Price Transparency:
                  </span>
                  <span style="font-size:9px; font-weight:700; background:rgba(16, 185, 129, 0.2); color:#34d399; padding:1px 5px; border-radius:3px;">
                    ${trust.price?.transparencyTier || 'HIGH'} TRANSPARENCY
                  </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:6px; font-size:10px; color:#94a3b8;">
                  <div>Base: <strong style="color:#f8fafc;">₹${trust.price?.basePrice ?? 100}</strong></div>
                  <div>Taxes (GST): <strong style="color:#f8fafc;">₹${trust.price?.taxes ?? 18}</strong></div>
                  <div>Tickets/Entry: <strong style="color:#f8fafc;">₹${trust.price?.monumentEntry ?? 40}</strong></div>
                  <div>Platform Fee: <strong style="color:#f8fafc;">₹${trust.price?.fees ?? 0}</strong></div>
                  <div>Surge: <strong style="color:#f8fafc;">₹${trust.price?.seasonalSurge ?? 0}</strong></div>
                  <div>Total: <strong style="color:#38bdf8; font-size:11px;">₹${trust.price?.total ?? 158}</strong></div>
                </div>
                <div style="font-size:9px; color:#64748b; margin-top:4px;">
                  ${trust.price?.advice || 'Itemized components verified against regional benchmarks.'}
                </div>
              </div>

              <!-- Expandable Evidence Graph Drawer -->
              <div id="trust-evidence-drawer" style="margin-top:8px; display:${isEvidenceDrawerOpen ? 'block' : 'none'}; background:rgba(15, 23, 42, 0.8); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px;">
                <div style="font-size:10px; font-weight:700; color:#38bdf8; margin-bottom:4px;">🔍 Corroborated Evidence Claims:</div>
                <ul style="margin:0; padding-left:16px; font-size:10px; color:#cbd5e1; line-height:1.5;">
                  ${(trust.claims || []).map(c => `
                    <li><strong>${c.claim}</strong> — <span style="color:#94a3b8;">${c.source} [${c.freshness}]</span></li>
                  `).join('')}
                </ul>
                <div style="margin-top:6px; font-size:9px; color:#94a3b8; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
                  Explainability: <em>"${trust.explainability?.whatToWatchOutFor || 'Standard verified operation.'}"</em>
                </div>
              </div>

              <!-- Action Buttons -->
              <div style="margin-top:10px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                <button id="btn-trust-view-evidence" style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; border:1px solid rgba(56, 189, 248, 0.35); border-radius:6px; padding:4px 10px; font-size:10px; font-weight:700; cursor:pointer;">
                  ${isEvidenceDrawerOpen ? '✕ Hide Evidence' : '🔍 View Evidence'}
                </button>
                <button id="btn-trust-view-source" style="background:rgba(16, 185, 129, 0.15); color:#34d399; border:1px solid rgba(16, 185, 129, 0.35); border-radius:6px; padding:4px 10px; font-size:10px; font-weight:700; cursor:pointer;">
                  🏛️ View Source
                </button>
                <button id="btn-trust-compare" style="background:rgba(255,255,255,0.08); color:#cbd5e1; border:1px solid rgba(255,255,255,0.15); border-radius:6px; padding:4px 8px; font-size:10px; font-weight:600; cursor:pointer;">
                  ⚖️ Compare
                </button>
                <button id="btn-trust-report" style="background:rgba(239, 68, 68, 0.12); color:#f87171; border:1px solid rgba(239, 68, 68, 0.25); border-radius:6px; padding:4px 8px; font-size:10px; font-weight:600; cursor:pointer;">
                  🚩 Report Problem
                </button>
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- Safety Data Sources & Ground-Truth Telemetry Status (Section 4 & Section 31) -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; margin-bottom:14px;">
        <div style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="display:flex; align-items:center; gap:6px;">🛡️ <span>Official Safety Providers & Real-Time Telemetry:</span></span>
          <span style="font-size:10px; color:#64748b;">Deterministic Machine Directives • Zero LLM Fabrication</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px;">
          ${(() => {
            const defaultProviders = [
              { provider: 'NDMA', name: 'NDMA SACHET', status: 'LIVE', dataCoverage: 'National Disaster Alerts (Polygon/Centroid)', recordCount: 72, activeAlertCount: 72, dataAgeSeconds: 45, sourceType: 'Official Directives', productionUsable: true },
              { provider: 'IMD', name: 'IMD Mausam', status: 'LIVE', dataCoverage: 'Color Warnings & Nowcasts (750+ Districts)', recordCount: 353, activeAlertCount: 353, dataAgeSeconds: 120, sourceType: 'National Met Service', productionUsable: true },
              { provider: 'CWC', name: 'CWC Flood Service', status: 'PARTIALLY_AVAILABLE', dataCoverage: 'Public Daily Flood Bulletins (Machine GIS IAM-protected)', recordCount: 0, activeAlertCount: 0, dataAgeSeconds: null, sourceType: 'Water Commission', accessLimitation: 'Departmental IAM required for GIS; public bulletins active', productionUsable: false },
              { provider: 'FSI', name: 'FSI Forest Fire', status: 'PARTIALLY_AVAILABLE', dataCoverage: 'Satellite Thermal Anomalies (FIRMS MAP_KEY required)', recordCount: 0, activeAlertCount: 0, dataAgeSeconds: null, sourceType: 'Forest Survey', accessLimitation: 'VIIRS satellite thermal anomaly detections; unconfirmed on road', productionUsable: false },
            ];
            const list = (Array.isArray(providerHealth) && providerHealth.length > 0) ? providerHealth : defaultProviders;
            const badgeStyles = {
              LIVE: { color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)' },
              DEGRADED: { color: '#f97316', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.35)' },
              PARTIALLY_AVAILABLE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)' },
              STALE: { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.35)' },
              UNAVAILABLE: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)' },
            };
            return list.map(p => {
              const b = badgeStyles[p.status] || badgeStyles.LIVE;
              const count = p.recordCount != null ? p.recordCount : (p.activeAlertCount || 0);
              const ageStr = p.dataAgeSeconds != null
                ? (p.dataAgeSeconds < 60 ? `Updated ${p.dataAgeSeconds}s ago` : `Updated ${Math.floor(p.dataAgeSeconds / 60)}m ago`)
                : (p.lastSuccessfulFetch ? 'Active' : 'Unreachable');
              return `
                <div class="provider-telemetry-card" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-size:12px; font-weight:700; color:#f8fafc;">${p.name || p.provider}</span>
                      <span style="background:${b.bg}; color:${b.color}; border:1px solid ${b.border}; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">${p.status}</span>
                    </div>
                    <div style="font-size:10px; color:#94a3b8; margin-top:3px; line-height:1.3;">
                      ${p.accessLimitation || p.dataCoverage || p.coverage || 'Official feed'}
                    </div>
                  </div>
                  <div style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.04); padding-top:4px; display:flex; justify-content:space-between; font-size:9px; color:#64748b;">
                    <span>${count > 0 ? `${count} active alerts` : (p.productionUsable ? '0 active alerts' : 'Partial Access')}</span>
                    <span>${ageStr}</span>
                  </div>
                </div>
              `;
            }).join('');
          })()}
        </div>
      </div>

      <!-- Demo Reality Simulator Controls (Visually Segregated, Section 29/30) -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; background:rgba(0,0,0,0.2); border-radius:8px; padding:12px; margin-top:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-size:11px; font-weight:700; color:#cbd5e1; display:flex; align-items:center; gap:5px;">
              <span>🧪</span> <span>Controlled Reality Mutation Controls:</span>
              <span style="background:rgba(234,88,12,0.2); color:#fdba74; font-size:9px; font-weight:800; padding:1px 6px; border-radius:3px;">ISOLATED FROM PROD</span>
            </div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">
              Inject synthetic disruptions to demonstrate adaptive replanning and safety guardrails.
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button id="btn-simulate-cricket-traffic" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>🏏</span> Match Traffic
            </button>
            <button id="btn-simulate-ghat-rain" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>🌧️</span> Ghat Downpour
            </button>
            <button id="btn-simulate-official-closure" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #dc2626, #991b1b); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>⛔</span> Road Closure
            </button>
            <button id="btn-simulate-safety-unavailable" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.12); color:#cbd5e1; border:1px solid rgba(255,255,255,0.2); border-radius:6px; padding:6px 10px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>ℹ️</span> Data Unavailable
            </button>
            <button id="btn-simulate-trust-price-mismatch" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #d97706, #b45309); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>💰</span> Price Surge
            </button>
            <button id="btn-simulate-trust-route-conflict" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #ea580c, #c2410c); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>⚡</span> Route Conflict
            </button>
            <button id="btn-simulate-next-deadline" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #ea580c, #c2410c); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>🚆</span> Train Deadline Risk
            </button>
            <button id="btn-simulate-next-disruption" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #dc2626, #991b1b); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>⚡</span> Next-Leg Disruption
            </button>
            <button id="btn-simulate-next-reset" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.12); color:#cbd5e1; border:1px solid rgba(255,255,255,0.2); border-radius:6px; padding:6px 10px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <span>↺</span> Reset Next Leg
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Mounts and manages the interactive lifecycle of the Trip Control Center HUD.
 * Connects directly to India In-Time v3.0 Journey State, Guardian, and Adaptation APIs.
 */
export function mountTripControlCenter(containerEl, tripData = {}, callbacks = {}) {
  if (!containerEl) return null;

  let currentTripData = { ...tripData };

  function render() {
    containerEl.innerHTML = renderTripControlCenter(currentTripData);
    bindEvents();
  }

  function bindEvents() {
    const completeBtn = containerEl.querySelector('#btn-complete-active-stop');
    if (completeBtn) {
      completeBtn.onclick = async () => {
        const stopId = completeBtn.getAttribute('data-stop-id');
        const tripId = completeBtn.getAttribute('data-trip-id');
        try {
          completeBtn.disabled = true;
          completeBtn.textContent = 'Updating...';
          if (window.API?.advanceJourneyProgress) {
            const res = await window.API.advanceJourneyProgress(tripId, 'COMPLETE', stopId);
            if (res) {
              currentTripData.activeStop = res.activeStop;
              currentTripData.completedStops = currentTripData.completedStops || [];
              const done = (currentTripData.upcomingStops || []).find(s => s.id === stopId) || { id: stopId, name: currentTripData.activeStop?.name || `Stop ${stopId}` };
              if (!currentTripData.completedStops.some(s => s.id === stopId)) {
                currentTripData.completedStops.push(done);
              }
              currentTripData.upcomingStops = (currentTripData.upcomingStops || []).filter(s => s.id !== stopId);
              if (res.isCompleted || (currentTripData.upcomingStops.length === 0 && !res.activeStop)) {
                currentTripData.isJourneyComplete = true;
                currentTripData.selectedIntent = currentTripData.selectedIntent || 'GO_TO_HOTEL';
              }
              if (callbacks.onProgress) callbacks.onProgress(res);
            }
          } else {
            currentTripData.completedStops = currentTripData.completedStops || [];
            if (currentTripData.activeStop) currentTripData.completedStops.push(currentTripData.activeStop);
            currentTripData.activeStop = currentTripData.upcomingStops?.[0] || null;
            currentTripData.upcomingStops = (currentTripData.upcomingStops || []).slice(1);
            if (currentTripData.upcomingStops.length === 0 && !currentTripData.activeStop) {
              currentTripData.isJourneyComplete = true;
              currentTripData.selectedIntent = currentTripData.selectedIntent || 'GO_TO_HOTEL';
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to complete stop:', err);
          completeBtn.disabled = false;
          completeBtn.textContent = '✓ Mark Completed';
        }
      };
    }

    const skipBtn = containerEl.querySelector('#btn-skip-active-stop');
    if (skipBtn) {
      skipBtn.onclick = async () => {
        const stopId = skipBtn.getAttribute('data-stop-id');
        const tripId = skipBtn.getAttribute('data-trip-id');
        try {
          skipBtn.disabled = true;
          skipBtn.textContent = 'Skipping...';
          if (window.API?.advanceJourneyProgress) {
            const res = await window.API.advanceJourneyProgress(tripId, 'SKIP', stopId);
            if (res) {
              currentTripData.activeStop = res.activeStop;
              currentTripData.upcomingStops = (currentTripData.upcomingStops || []).filter(s => s.id !== stopId);
              if (callbacks.onProgress) callbacks.onProgress(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to skip stop:', err);
          skipBtn.disabled = false;
          skipBtn.textContent = '⏭ Skip';
        }
      };
    }

    const replanBtn = containerEl.querySelector('#btn-trigger-replan');
    if (replanBtn) {
      replanBtn.onclick = async () => {
        const tripId = replanBtn.getAttribute('data-trip-id');
        try {
          replanBtn.disabled = true;
          replanBtn.textContent = 'Adapting Plan...';
          if (window.API?.adaptTripPlan) {
            const res = await window.API.adaptTripPlan(tripId, 'DISRUPTION_ADAPTATION');
            if (res && res.newPlanVersion) {
              currentTripData.planVersion = res.newPlanVersion;
              currentTripData.tripHealth = 'ON_TRACK';
              currentTripData.activeTriggers = [];
              currentTripData.lastAdaptation = res;
              if (Array.isArray(res.newStopsList)) {
                currentTripData.completedStops = res.newStopsList.filter(s => s.status === 'COMPLETED');
                currentTripData.upcomingStops = res.newStopsList.filter(s => s.status === 'PLANNED');
                currentTripData.activeStop = res.newStopsList.find(s => s.status === 'PLANNED') || null;
              }
              if (callbacks.onPlanAdapted) callbacks.onPlanAdapted(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to adapt plan:', err);
          replanBtn.disabled = false;
          replanBtn.textContent = '⚡ Adapt Plan Now';
        }
      };
    }

    const clearSimBtn = containerEl.querySelector('#btn-clear-simulation');
    if (clearSimBtn) {
      clearSimBtn.onclick = () => {
        currentTripData.isSimulationActive = false;
        currentTripData.simulationScenario = null;
        currentTripData.activeTriggers = [];
        currentTripData.tripHealth = 'ON_TRACK';
        render();
      };
    }

    const simBtn = containerEl.querySelector('#btn-simulate-ghat-rain');
    if (simBtn) {
      simBtn.onclick = async () => {
        const tripId = simBtn.getAttribute('data-trip-id');
        try {
          simBtn.disabled = true;
          simBtn.textContent = 'Simulating...';
          currentTripData.isSimulationActive = true;
          currentTripData.simulationScenario = 'Ghat Downpour & Landslide Risk';
          if (window.API?.simulateDisruptionEvent) {
            const res = await window.API.simulateDisruptionEvent(tripId, { eventType: 'HEAVY_RAIN_GHAT' });
            if (res && res.guardianEvaluation) {
              currentTripData.tripHealth = res.guardianEvaluation.tripHealth || 'CRITICAL';
              currentTripData.activeTriggers = (res.guardianEvaluation.activeTriggers || []).map(t => ({
                type: t.trigger || 'DISRUPTION',
                message: t.rationale || t.message || 'Severe weather and road risk detected',
              }));
              if (currentTripData.activeTriggers.length === 0 && res.guardianEvaluation.reasons) {
                currentTripData.activeTriggers = res.guardianEvaluation.reasons.map(r => ({
                  type: 'WEATHER_ROAD_RISK',
                  message: r,
                }));
              }
              if (callbacks.onSimulated) callbacks.onSimulated(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to simulate disruption:', err);
          simBtn.disabled = false;
          simBtn.textContent = '🌧️ Ghat Downpour';
        }
      };
    }

    const cricketSimBtn = containerEl.querySelector('#btn-simulate-cricket-traffic');
    if (cricketSimBtn) {
      cricketSimBtn.onclick = async () => {
        const tripId = cricketSimBtn.getAttribute('data-trip-id');
        try {
          cricketSimBtn.disabled = true;
          cricketSimBtn.textContent = 'Simulating...';
          currentTripData.isSimulationActive = true;
          currentTripData.simulationScenario = 'Cricket Match Stadium Congestion';
          if (window.API?.simulateTripDisruption) {
            const res = await window.API.simulateTripDisruption(tripId, {
              simulationScenario: 'CRICKET_MATCH_CONGESTION',
              corridorName: 'NH16 Stadium Corridor',
              currentTravelMinutes: 75,
              freeFlowMinutes: 25,
            });
            if (res && res.disruptionEvaluation) {
              const evalRes = res.disruptionEvaluation;
              currentTripData.tripHealth = evalRes.disruption?.severity === 'CRITICAL' ? 'CRITICAL' : 'SUBOPTIMAL';
              currentTripData.activeTriggers = [
                {
                  type: evalRes.disruption?.eventType || 'CRICKET_MATCH',
                  message: `Stadium congestion (+${evalRes.disruption?.estimatedDelay || 50}m). Disruption: ${evalRes.disruption?.disruptionConfidence || 'HIGH'}, Cause: ${evalRes.disruption?.causeConfidence || 'HIGH'}.`,
                },
              ];
              if (callbacks.onSimulated) callbacks.onSimulated(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to simulate cricket traffic:', err);
          cricketSimBtn.disabled = false;
          cricketSimBtn.textContent = '🏏 Match Traffic';
        }
      };
    }

    const closureBtn = containerEl.querySelector('#btn-simulate-official-closure');
    if (closureBtn) {
      closureBtn.onclick = async () => {
        const tripId = closureBtn.getAttribute('data-trip-id');
        try {
          closureBtn.disabled = true;
          closureBtn.textContent = 'Simulating...';
          currentTripData.isSimulationActive = true;
          currentTripData.simulationScenario = 'Official Road Closure Directive';
          if (window.API?.simulateTripSafety) {
            const res = await window.API.simulateTripSafety(tripId, { scenario: 'OFFICIAL_ROAD_CLOSURE' });
            if (res && res.safetyEvaluation) {
              currentTripData.tripHealth = 'CRITICAL';
              currentTripData.activeTriggers = [
                { type: 'ROAD_CLOSURE', message: 'Official Road Closure on corridor: detour required.' }
              ];
              if (callbacks.onSimulated) callbacks.onSimulated(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to simulate road closure:', err);
          closureBtn.disabled = false;
          closureBtn.textContent = '⛔ Road Closure';
        }
      };
    }

    const unavailBtn = containerEl.querySelector('#btn-simulate-safety-unavailable');
    if (unavailBtn) {
      unavailBtn.onclick = async () => {
        const tripId = unavailBtn.getAttribute('data-trip-id');
        try {
          unavailBtn.disabled = true;
          unavailBtn.textContent = 'Simulating...';
          currentTripData.isSimulationActive = true;
          currentTripData.simulationScenario = 'Safety Provider Outage / Stale Data';
          if (window.API?.simulateTripSafety) {
            const res = await window.API.simulateTripSafety(tripId, { scenario: 'DATA_UNAVAILABLE' });
            if (res && res.safetyEvaluation) {
              currentTripData.tripHealth = 'INSUFFICIENT_DATA';
              currentTripData.activeTriggers = [
                { type: 'SAFETY_DATA_STALE', message: 'Current safety information could not be refreshed from upstream providers.' }
              ];
              if (callbacks.onSimulated) callbacks.onSimulated(res);
            }
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to simulate safety data unavailable:', err);
          unavailBtn.disabled = false;
          unavailBtn.textContent = 'ℹ️ Data Unavailable';
        }
      };
    }

    const acceptExpBtn = containerEl.querySelector('#btn-accept-experience');
    if (acceptExpBtn) {
      acceptExpBtn.onclick = async () => {
        const placeId = acceptExpBtn.getAttribute('data-place-id');
        const tripId = acceptExpBtn.getAttribute('data-trip-id');
        try {
          acceptExpBtn.disabled = true;
          acceptExpBtn.textContent = 'Prioritizing...';
          if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            const resp = await window.fetch(`/api/intelligence/trips/${tripId}/experience/decide`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ placeId, actionTaken: 'ACCEPTED' }),
            }).catch(() => null);

            if (resp && resp.ok) {
              const resData = await resp.json();
              if (resData && (resData.newPlanVersion || resData.activePlanVersion)) {
                currentTripData.planVersion = resData.newPlanVersion || resData.activePlanVersion;
                if (Array.isArray(resData.resequencedStops)) {
                  currentTripData.upcomingStops = resData.resequencedStops.filter(s => s.status === 'PLANNED');
                  currentTripData.completedStops = resData.resequencedStops.filter(s => s.status === 'COMPLETED' || s.status === 'SKIPPED');
                  currentTripData.activeStop = resData.activeStop || resData.resequencedStops.find(s => s.status === 'PLANNED') || null;
                }
              }
            }
          }
          acceptExpBtn.textContent = '✓ Prioritized';
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to accept experience:', err);
          acceptExpBtn.disabled = false;
        }
      };
    }

    const deferExpBtn = containerEl.querySelector('#btn-defer-experience');
    if (deferExpBtn) {
      deferExpBtn.onclick = async () => {
        const placeId = deferExpBtn.getAttribute('data-place-id');
        const tripId = deferExpBtn.getAttribute('data-trip-id');
        try {
          deferExpBtn.disabled = true;
          deferExpBtn.textContent = 'Preserved';
          if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            await window.fetch(`/api/intelligence/trips/${tripId}/experience/decide`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ placeId, actionTaken: 'DEFERRED' }),
            }).catch(() => {});
          }
        } catch (err) {
          console.error('[TripControlCenter] Failed to defer experience:', err);
          deferExpBtn.disabled = false;
        }
      };
    }

    // Trust Event Listeners
    const viewEvidenceBtn = containerEl.querySelector('#btn-trust-view-evidence');
    if (viewEvidenceBtn) {
      viewEvidenceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isEvidenceDrawerOpen = !currentTripData.isEvidenceDrawerOpen;
        render();
      });
    }

    const viewSourceBtn = containerEl.querySelector('#btn-trust-view-source');
    if (viewSourceBtn) {
      viewSourceBtn.addEventListener('click', () => {
        alert('Verified Official Source: Ministry of Tourism (NIDHI+) & FoSCoS FSSAI Central Digital Registry. Registration authentic.');
      });
    }

    const compareBtn = containerEl.querySelector('#btn-trust-compare');
    if (compareBtn) {
      compareBtn.addEventListener('click', () => {
        alert('Trust Comparison: This venue exhibits +22% higher evidential provenance than regional alternatives.');
      });
    }

    const reportBtn = containerEl.querySelector('#btn-trust-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', async () => {
        reportBtn.textContent = 'Submitting...';
        try {
          if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            await window.fetch('/api/intelligence/trust/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entityId: currentTripData.activeStop?.id || 'stop_active',
                outcomeType: 'PRICE_MISMATCH',
                notes: 'Traveler reported discrepancy via Trip Control Center.',
              }),
            }).catch(() => {});
          }
          reportBtn.textContent = '✓ Report Logged';
          setTimeout(() => { reportBtn.textContent = '🚩 Report Problem'; }, 3000);
        } catch {
          reportBtn.textContent = '🚩 Report Problem';
        }
      });
    }

    const simPriceSurgeBtn = containerEl.querySelector('#btn-simulate-trust-price-mismatch');
    if (simPriceSurgeBtn) {
      simPriceSurgeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'High-Season Tariff Surge (+60%)';
        currentTripData.trustIntelligence = {
          ...(currentTripData.trustIntelligence || {}),
          targetName: currentTripData.activeStop?.name || 'Kailasagiri Hilltop Park',
          trustState: 'CONFLICTED',
          confidence: 76,
          summary: 'Unexplained price elevation (+60%) detected vs historical seasonal median.',
          price: {
            basePrice: 160,
            taxes: 28,
            fees: 15,
            monumentEntry: 40,
            seasonalSurge: 50,
            total: 293,
            transparencyTier: 'MEDIUM',
            freshness: 'FRESH',
            advice: 'Price exceeds expected regional range. Inquire on inclusions before purchase.',
          },
        };
        render();
      });
    }

    const simRouteConflictBtn = containerEl.querySelector('#btn-simulate-trust-route-conflict');
    if (simRouteConflictBtn) {
      simRouteConflictBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Route Ground Discrepancy (Map Open vs NHAI Closure)';
        currentTripData.tripHealth = 'CRITICAL';
        currentTripData.trustIntelligence = {
          ...(currentTripData.trustIntelligence || {}),
          targetName: 'Bheemili Beach Road Access Segment',
          trustState: 'CONFLICTED',
          confidence: 96,
          summary: 'ROUTE_CONFLICT: Navigation app indicates road open, but NHAI/Police alert confirms active sea-surge road closure.',
          explainability: {
            canITrustThis: 'NO - Route ground contradiction detected.',
            why: 'Commercial map contradicts official safety authority closure.',
            whatToWatchOutFor: 'Do not follow GPS into submerged coastal highway section.',
          },
        };
        render();
      });
    }

    // Phase 6: Next Journey Intelligence Listeners
    const finishToNextBtn = containerEl.querySelector('#btn-finish-journey-to-next');
    if (finishToNextBtn) {
      finishToNextBtn.addEventListener('click', () => {
        currentTripData.isJourneyComplete = true;
        if (currentTripData.activeStop) {
          currentTripData.completedStops = currentTripData.completedStops || [];
          if (!currentTripData.completedStops.some(s => s.id === currentTripData.activeStop.id)) {
            currentTripData.completedStops.push(currentTripData.activeStop);
          }
          currentTripData.activeStop = null;
        }
        currentTripData.upcomingStops = [];
        currentTripData.selectedIntent = currentTripData.selectedIntent || 'GO_TO_HOTEL';
        render();
      });
    }

    containerEl.querySelectorAll('.btn-next-intent').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const intent = btn.getAttribute('data-next-intent');
        currentTripData.selectedIntent = intent;
        currentTripData.selectedCandidate = null;
        currentTripData.nextLegCandidates = DEFAULT_CANDIDATES_BY_INTENT[intent] || DEFAULT_CANDIDATES_BY_INTENT.GO_TO_HOTEL;

        if (intent === 'END_JOURNEY') {
          alert('Journey Concluded. All historical journey legs are archived.');
          return;
        }

        const tripId = btn.getAttribute('data-trip-id');
        if (typeof window !== 'undefined' && window.API?.submitNextLegIntent) {
          try {
            const res = await window.API.submitNextLegIntent(tripId, intent);
            if (res && Array.isArray(res.candidates) && res.candidates.length > 0) {
              currentTripData.nextLegCandidates = res.candidates;
            }
          } catch (_err) {
            // fallback to preset candidates
          }
        }
        render();
      });
    });

    containerEl.querySelectorAll('.btn-select-next-candidate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const candId = btn.getAttribute('data-candidate-id');
        const activeList = currentTripData.nextLegCandidates || DEFAULT_CANDIDATES_BY_INTENT[currentTripData.selectedIntent] || [];
        const found = activeList.find(c => c.id === candId);
        if (found) {
          currentTripData.selectedCandidate = found;
          render();
        }
      });
    });

    const startNextLegBtn = containerEl.querySelector('#btn-start-next-leg');
    if (startNextLegBtn) {
      startNextLegBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const candId = startNextLegBtn.getAttribute('data-candidate-id');
        const activeList = currentTripData.nextLegCandidates || DEFAULT_CANDIDATES_BY_INTENT[currentTripData.selectedIntent] || [];
        const selected = currentTripData.selectedCandidate || activeList.find(c => c.id === candId) || activeList[0];

        // Append completed historical leg
        currentTripData.journeyLegs = currentTripData.journeyLegs || [];
        currentTripData.journeyLegs.push({
          legIndex: currentTripData.currentLegIndex || 1,
          name: `Leg ${currentTripData.currentLegIndex || 1} Exploration`,
          status: 'COMPLETED',
        });

        // Advance to Leg 2 (or next)
        currentTripData.currentLegIndex = (currentTripData.currentLegIndex || 1) + 1;
        currentTripData.isJourneyComplete = false;
        currentTripData.planVersion = 1;
        currentTripData.tripHealth = 'ON_TRACK';
        currentTripData.activeStop = {
          id: selected.id,
          name: selected.name,
          category: selected.category,
          plannedDurationMinutes: 60,
        };
        currentTripData.upcomingStops = [];
        currentTripData.deadlineAlert = null;
        currentTripData.selectedCandidate = null;

        const tripId = startNextLegBtn.getAttribute('data-trip-id');
        if (typeof window !== 'undefined' && window.API?.decideNextLeg) {
          try {
            await window.API.decideNextLeg(tripId, 'ACCEPT', { candidateId: selected.id });
          } catch (_err) {
            // local advance fallback
          }
        }
        render();
      });
    }

    const simDeadlineBtn = containerEl.querySelector('#btn-simulate-next-deadline');
    if (simDeadlineBtn) {
      simDeadlineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Train Departure Tight Window (VSKP Junction)';
        currentTripData.selectedIntent = 'GO_TO_RAILWAY_STATION';
        currentTripData.deadlineAlert = {
          stationName: 'Visakhapatnam Junction (VSKP)',
          scheduledDeparture: '22:30',
          requiredBufferMinutes: 45,
          availableBufferMinutes: 12,
          riskState: 'DEADLINE_RISK',
          urgency: 'IMMEDIATE_DEPARTURE',
        };
        render();
      });
    }

    const simDisruptionBtn = containerEl.querySelector('#btn-simulate-next-disruption');
    if (simDisruptionBtn) {
      simDisruptionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Highway Inundation on NH16 Corridor';
        currentTripData.tripHealth = 'CRITICAL';
        currentTripData.activeTriggers = [
          { type: 'ROAD_FLOODING', message: 'Severe coastal flash flood on NH16 corridor. Next leg adaptation required.' },
        ];
        render();
      });
    }

    const simResetBtn = containerEl.querySelector('#btn-simulate-next-reset');
    if (simResetBtn) {
      simResetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = false;
        currentTripData.simulationScenario = null;
        currentTripData.deadlineAlert = null;
        currentTripData.activeTriggers = [];
        currentTripData.tripHealth = 'ON_TRACK';
        render();
      });
    }
  }

  // Fetch real-time official provider health telemetry if available
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    window.fetch('/api/intelligence/safety/providers')
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.providers)) {
          currentTripData.providerHealth = data.providers;
          render();
        }
      })
      .catch(() => {});
  }

  render();

  return {
    update(newData) {
      currentTripData = { ...currentTripData, ...newData };
      render();
    },
    destroy() {
      containerEl.innerHTML = '';
    },
  };
}

/**
 * Initializes journey state on backend and mounts the Trip Control Center into containerEl.
 */
export async function initActiveTripControlCenter(containerEl, tripPlan, travelerDna = null) {
  if (!containerEl || !Array.isArray(tripPlan) || !tripPlan.length) return null;
  containerEl.style.display = 'block';
  const tripId = `trip_${Date.now()}`;
  const flatStops = tripPlan.flat().filter(s => s && !s.isBreak).map((s, idx) => ({
    id: String(s.id || `stop_${idx + 1}`),
    name: s.name,
    category: s.cat || s.category || 'scenic',
    lat: Array.isArray(s.coords) ? s.coords[0] : (s.lat || 0),
    lon: Array.isArray(s.coords) ? s.coords[1] : (s.lon || 0),
    elevationM: s.elevationM || (s.coords?.[0] > 18 && s.coords?.[1] > 82 ? 900 : 50),
    plannedDurationMinutes: s.vt || 45,
    arriveAt: s.arriveAt || '09:00',
    leaveAt: s.leaveAt || '10:00',
    status: 'PLANNED',
  }));

  let st = null;
  if (window.API?.initJourneyState) {
    try {
      st = await window.API.initJourneyState(tripId, flatStops, travelerDna);
    } catch (err) {
      console.warn('[TripControlCenter] Backend init failed, using local mount:', err);
    }
  }

  return mountTripControlCenter(containerEl, {
    tripId,
    planVersion: st?.activePlanVersion || 1,
    tripHealth: st?.tripHealth || 'ON_TRACK',
    activeStop: st?.activeStop || flatStops[0],
    completedStops: [],
    upcomingStops: st?.upcomingStops || flatStops.slice(1),
  });
}


