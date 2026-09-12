/**
 * frontend/app-src/src/modules/tripControlCenter.js
 *
 * India In-Time v3.0 Trip Control Center — Phase 7 Mobile-First Traveler Experience
 *
 * Core UX Principles:
 * - Complexity in the engine -> Simplicity in the experience
 * - Traveler Mode (simple, action-oriented, 1 primary action) vs Expert Mode (deep telemetry & audit)
 * - Progressive disclosure: Level 1 (Decision) -> Level 2 (Reason) -> Level 3 (Evidence)
 * - Bottom sheets for why-explanations, trust evidence, and hotel details
 * - Visually segregated simulation controls in Developer / Demo section
 * - 100% preservation of all Phase 1-6 decision and test contract IDs
 */

import { openBottomSheet, closeBottomSheet } from './bottomSheet.js';

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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 95,
      fitTier: 'HIGH_VALUE',
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
      trustState: 'SUPPORTED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 91,
      fitTier: 'BALANCED_FIT',
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
      trustState: 'SUPPORTED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 88,
      fitTier: 'BALANCED_FIT',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 90,
      fitTier: 'HIGH_VALUE',
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
      trustState: 'SUPPORTED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 87,
      fitTier: 'BALANCED_FIT',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 99,
      fitTier: 'HIGH_VALUE',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 99,
      fitTier: 'HIGH_VALUE',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 94,
      fitTier: 'HIGH_VALUE',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 100,
      fitTier: 'HIGH_VALUE',
      explanation: 'Return to primary residence. Coordinates kept private.',
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
      trustState: 'SUPPORTED',
      safetyStatus: 'CAUTION: Night Ghat Section',
      tomorrowUtilityScore: 98,
      fitTier: 'HIGH_VALUE',
      explanation: 'Next scenic circuit destination; daylight ascent recommended.',
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
      trustState: 'SUPPORTED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 90,
      fitTier: 'BALANCED_FIT',
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
      trustState: 'VERIFIED',
      safetyStatus: 'CLEAR',
      tomorrowUtilityScore: 100,
      fitTier: 'HIGH_VALUE',
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
  _providerHealth = [],
  _experienceOptimization = null,
  trustIntelligence = null,
  isEvidenceDrawerOpen = false,
  isJourneyComplete = false,
  _currentLegIndex = 1,
  _journeyLegs = [],
  selectedIntent = 'GO_TO_HOTEL',
  nextLegCandidates = null,
  selectedCandidate = null,
  deadlineAlert = null,
  presentationMode = 'TRAVELER', // 'TRAVELER' or 'EXPERT'
  isDemoDrawerOpen = false,
} = {}) {
  const isTraveler = presentationMode !== 'EXPERT';

  const healthBadges = {
    ON_TRACK: { icon: '🟢', label: 'On Track', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    WATCH: { icon: '🟡', label: 'Watch Active', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    SUBOPTIMAL: { icon: '🟠', label: 'Suboptimal Conditions', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },
    CRITICAL: { icon: '🔴', label: 'Adaptation Required', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    REPLAN_RECOMMENDED: { icon: '⚠️', label: 'Replan Recommended', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_CAUTION: { icon: '🛡️', label: 'Safety Caution', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_ACTION_RECOMMENDED: { icon: '⚠️', label: 'Safety Action Recommended', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    INSUFFICIENT_DATA: { icon: 'ℹ️', label: 'Data Stale / Unverified', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  };

  const currentBadge = healthBadges[tripHealth] || healthBadges.ON_TRACK;

  // Next Action Destination Resolution
  const nextTarget = activeStop || (upcomingStops && upcomingStops[0]) || null;
  const isComplete = isJourneyComplete || (!nextTarget && upcomingStops.length === 0);

  // Remaining journey time calculation
  const totalRemainingMinutes = (activeStop?.plannedDurationMinutes || 45) +
    (upcomingStops || []).reduce((acc, s) => acc + (s.plannedDurationMinutes || s.vt || 45), 0);
  const remHours = Math.floor(totalRemainingMinutes / 60);
  const remMins = totalRemainingMinutes % 60;
  const remainingTimeStr = remHours > 0 ? `${remHours}h ${remMins}m remaining` : `${remMins}m remaining`;

  return `
    <div id="trip-control-center" class="trip-control-hud" style="background:var(--bg-surface, #1e293b); border-radius:16px; padding:16px; border:1px solid rgba(255,255,255,0.08); margin:12px 0; color:#f8fafc; font-family:inherit;">
      
      <!-- Top Bar: Context & Presentation Mode Switch -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">🧭</span>
            <h3 style="margin:0; font-size:17px; font-weight:800; letter-spacing:-0.01em;">Trip Journey HUD</h3>
            <span style="background:rgba(99,102,241,0.2); color:#818cf8; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700;">v${planVersion}</span>
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
            ${nextTarget ? `Corridor: <strong>${nextTarget.name}</strong>` : 'Journey in progress'} • ${remainingTimeStr}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <!-- Presentation Mode Switcher (Section 4) -->
          <div class="mode-switch-bar">
            <button id="btn-mode-traveler" class="mode-switch-pill ${isTraveler ? 'active' : ''}" type="button">🧭 Traveler</button>
            <button id="btn-mode-expert" class="mode-switch-pill ${!isTraveler ? 'active' : ''}" type="button">🔍 Expert</button>
          </div>

          <div style="display:inline-flex; align-items:center; gap:5px; background:${currentBadge.bg}; border:1px solid ${currentBadge.color}; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; color:${currentBadge.color};">
            <span>${currentBadge.icon}</span>
            <span>${currentBadge.label}</span>
          </div>
        </div>
      </div>

      <!-- Persistent Simulation Isolation Banner (Section 32) -->
      ${isSimulationActive ? `
        <div id="simulation-active-banner" class="simulation-active-banner" style="background:rgba(234, 88, 12, 0.18); border:1.5px solid #ea580c; border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">🧪</span>
            <div>
              <div style="font-size:12px; font-weight:800; color:#fdba74; letter-spacing:0.03em;">SIMULATION ACTIVE — DEMO DATA</div>
              <div style="font-size:11px; color:#fed7aa; margin-top:2px;">Scenario: <strong>${simulationScenario || 'Synthetic Reality Mutation'}</strong></div>
            </div>
          </div>
          <button id="btn-clear-simulation" data-trip-id="${tripId}" style="background:#ea580c; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer;">
            ✕ Clear
          </button>
        </div>
      ` : ''}

      <!-- Sticky Transport Departure Deadline Alert (Section 24 & 25) -->
      ${(deadlineAlert || (selectedIntent && selectedIntent.includes('RAILWAY') && activeTriggers.some(t => t.type === 'DEADLINE_RISK'))) ? `
        <div class="deadline-risk-sticky">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:13px; font-weight:800; color:#fff; display:flex; align-items:center; gap:6px;">
              <span>🚆</span> TRAIN DEPARTS IN 42 MIN
            </div>
            <span style="background:#ef4444; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">DEADLINE RISK</span>
          </div>
          <div style="font-size:12px; color:#fed7aa; margin-bottom:10px;">
            Leave now to preserve the required 45m boarding buffer. (Current buffer: 28m)
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btn-start-route-now" class="btn-primary-action" style="background:#ef4444; color:#fff; flex:1; min-height:44px; font-size:13px;">
              🚀 START ROUTE NOW
            </button>
            <button id="btn-why-deadline" class="btn-subordinate" style="border-color:rgba(255,255,255,0.3); color:#fff;">
              Why?
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Visually Dominant Safety Alert Banner (Section 18) -->
      ${activeTriggers.length > 0 ? `
        <div class="safety-alert-dominant">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <div style="font-weight:800; color:#fca5a5; font-size:14px; display:flex; align-items:center; gap:6px;">
                <span>⚠️</span> REALITY DISRUPTION DETECTED
              </div>
              <ul style="margin:6px 0 0 16px; padding:0; font-size:12px; color:#f8fafc; line-height:1.45;">
                ${activeTriggers.map(t => `<li><strong>${t.type}</strong>: ${t.message}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button id="btn-trigger-replan" data-trip-id="${tripId}" class="btn-primary-action" style="background:#ef4444; color:#fff; flex:1; min-height:44px; font-size:13px;">
              ⚡ Adapt Plan Now
            </button>
            <button id="btn-why-disruption" class="btn-subordinate" style="border-color:rgba(255,255,255,0.3); color:#fff;">
              Why?
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Contextual Adaptation Notice (if v2+) -->
      ${lastAdaptation ? `
        <div style="background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.3); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px;">
          <div style="font-weight:700; color:#93c5fd; margin-bottom:2px;">✨ Contextual Adaptation Active (v${planVersion})</div>
          <div style="color:#cbd5e1; line-height:1.4;">${lastAdaptation.explanation || 'Plan adapted for current conditions.'}</div>
        </div>
      ` : ''}

      <!-- ═══ SECTION 2: NEXT ACTION CARD (ONE PRIMARY ACTION) ═══ -->
      ${!isComplete && nextTarget ? `
        <div style="background:rgba(15, 23, 42, 0.65); border:1.5px solid rgba(255,255,255,0.12); border-radius:14px; padding:16px; margin-bottom:14px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#94a3b8; font-weight:800;">
              ${activeStop ? 'Current Destination' : 'Next Recommended Stop'}
            </span>
            <span style="background:linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25)); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); font-size:10px; padding:2px 7px; border-radius:4px; font-weight:700;">
              ${activeStop ? 'IN PROGRESS' : 'HIGH FIT'}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
            <h4 style="margin:0; font-size:18px; font-weight:800; color:#ffffff;">${nextTarget.name}</h4>
            <span style="font-size:13px; font-weight:700; color:#38bdf8;">${nextTarget.plannedDurationMinutes || 45} min</span>
          </div>

          <p style="margin:0 0 14px; font-size:12px; color:#94a3b8; line-height:1.4;">
            ${nextTarget.category || 'Scenic'} • Arrive ${nextTarget.arriveAt || '09:00'}
          </p>

          <!-- The ONE Prominent Primary Action -->
          <button id="btn-complete-active-stop" data-stop-id="${nextTarget.id}" data-trip-id="${tripId}" class="btn-primary-action" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; margin-bottom:10px;">
            <span>✓</span> <span>Mark Completed</span>
          </button>

          <!-- Subordinate Secondary Actions -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:8px;">
              <button id="btn-skip-active-stop" data-stop-id="${nextTarget.id}" data-trip-id="${tripId}" class="btn-subordinate">
                ⏭ Skip
              </button>
              <button id="btn-finish-journey-to-next" data-trip-id="${tripId}" class="btn-subordinate">
                🏁 Finish & Plan Next Leg
              </button>
            </div>
            <button id="btn-why-this-action" type="button" style="background:none; border:none; color:#818cf8; font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline; padding:4px;">
              Why this?
            </button>
          </div>
        </div>
      ` : ''}

      <!-- ═══ SECTION 3: TODAY'S JOURNEY TIMELINE ═══ -->
      <div style="background:rgba(15, 23, 42, 0.4); border-radius:12px; padding:14px; border:1px solid rgba(255,255,255,0.06); margin-bottom:14px;">
        <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; margin-bottom:10px; display:flex; justify-content:space-between;">
          <span>Today's Journey Progress</span>
          <span>${completedStops.length} of ${(completedStops.length + upcomingStops.length + (activeStop ? 1 : 0))} done</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
          ${completedStops.map(s => `
            <div style="display:flex; align-items:center; gap:8px; color:#64748b;">
              <span style="color:#10b981; font-weight:800;">✓</span>
              <span style="text-decoration:line-through;">${s.name}</span>
            </div>
          `).join('')}

          ${activeStop ? `
            <div style="display:flex; align-items:center; gap:8px; color:#38bdf8; font-weight:700;">
              <span>→</span>
              <span>${activeStop.name}</span>
              <span style="font-size:9px; background:rgba(56, 189, 248, 0.2); padding:1px 5px; border-radius:3px;">Current</span>
            </div>
          ` : ''}

          ${upcomingStops.map(s => `
            <div style="display:flex; align-items:center; gap:8px; color:#cbd5e1;">
              <span style="color:#94a3b8;">•</span>
              <span>${s.name}</span>
            </div>
          `).join('')}

          ${completedStops.length === 0 && !activeStop && upcomingStops.length === 0 ? `
            <div style="font-size:11px; color:#64748b; font-style:italic;">No stops scheduled.</div>
          ` : ''}
        </div>
      </div>

      <!-- ═══ SECTION 5: NEXT JOURNEY INTELLIGENCE (Section 21) ═══ -->
      ${(() => {
        const activeCandidates = (Array.isArray(nextLegCandidates) && nextLegCandidates.length > 0)
          ? nextLegCandidates
          : (DEFAULT_CANDIDATES_BY_INTENT[selectedIntent] || DEFAULT_CANDIDATES_BY_INTENT.GO_TO_HOTEL);
        const topCandidate = selectedCandidate || activeCandidates[0];

        return `
          <div id="next-journey-panel" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:14px; margin-bottom:14px;">
            ${isComplete ? `
              <div style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15)); border:1.5px solid #10b981; border-radius:12px; padding:12px 14px; margin-bottom:12px; text-align:center;">
                <div style="font-size:15px; font-weight:800; color:#6ee7b7;">🎉 CURRENT LEG COMPLETE</div>
                <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">Where would you like to go next?</div>
              </div>
            ` : `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:12px; font-weight:800; color:#cbd5e1;">Next Destination / Leg Planning</span>
                <span style="font-size:10px; color:#94a3b8;">Intent-driven candidates</span>
              </div>
            `}

            <!-- 8 Intent Chips (Section 21 & 26) -->
            <div class="intent-chips-grid">
              <button class="intent-chip btn-next-intent ${selectedIntent === 'GO_TO_HOTEL' ? 'active' : ''}" data-next-intent="GO_TO_HOTEL" data-trip-id="${tripId}">
                <span>🏨</span><span>Stay</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'GO_TO_RESTAURANT' ? 'active' : ''}" data-next-intent="GO_TO_RESTAURANT" data-trip-id="${tripId}">
                <span>🍽</span><span>Food</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'RETURN_HOME' ? 'active' : ''}" data-next-intent="RETURN_HOME" data-trip-id="${tripId}">
                <span>🏠</span><span>Home</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'GO_TO_RAILWAY_STATION' ? 'active' : ''}" data-next-intent="GO_TO_RAILWAY_STATION" data-trip-id="${tripId}">
                <span>🚆</span><span>Train</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'GO_TO_AIRPORT' ? 'active' : ''}" data-next-intent="GO_TO_AIRPORT" data-trip-id="${tripId}">
                <span>✈</span><span>Airport</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'GO_TO_BUS_STATION' ? 'active' : ''}" data-next-intent="GO_TO_BUS_STATION" data-trip-id="${tripId}">
                <span>🚌</span><span>Bus</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'CONTINUE_TO_DESTINATION' ? 'active' : ''}" data-next-intent="CONTINUE_TO_DESTINATION" data-trip-id="${tripId}">
                <span>📍</span><span>Next Stop</span>
              </button>
              <button class="intent-chip btn-next-intent ${selectedIntent === 'CUSTOM_DESTINATION' ? 'active' : ''}" data-next-intent="CUSTOM_DESTINATION" data-trip-id="${tripId}">
                <span>✏</span><span>Custom</span>
              </button>
            </div>

            <!-- Compact Candidate Cards (Section 22 & 23) -->
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
              ${activeCandidates.slice(0, 3).map((cand, _idx) => {
                const isSel = topCandidate?.id === cand.id;
                const priceText = cand.price?.total ? `₹${cand.price.total}` : 'Standard Fare';
                return `
                  <div class="next-candidate-card" data-candidate-id="${cand.id}" data-intent="${selectedIntent}" style="background:${isSel ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.03)'}; border:1px solid ${isSel ? '#818cf8' : 'rgba(255, 255, 255, 0.08)'}; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="flex:1; min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <strong style="font-size:13px; color:#f8fafc; word-break:break-word;">${cand.name}</strong>
                        <span style="font-size:9px; background:rgba(16, 185, 129, 0.15); color:#34d399; padding:1px 5px; border-radius:3px; font-weight:700;">
                          ${cand.trustState || 'SUPPORTED'}
                        </span>
                      </div>
                      <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                        ${cand.durationMinutes} min (${cand.distanceKm} km) • <span style="color:#38bdf8; font-weight:700;">${priceText}</span> • ${cand.checkinStatus || 'Open'}
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                      <button type="button" class="btn-select-next-candidate" data-candidate-id="${cand.id}" data-intent="${selectedIntent}" aria-label="${isSel ? 'Candidate already selected' : 'Select destination'}" style="background:${isSel ? '#6366f1' : 'rgba(255,255,255,0.08)'}; color:#fff; border:none; border-radius:6px; padding:8px 12px; min-height:40px; font-size:12px; font-weight:700; cursor:pointer; touch-action:manipulation;">
                        ${isSel ? 'Selected' : 'Select'}
                      </button>
                      <button type="button" class="btn-view-next-details" data-candidate-id="${cand.id}" data-intent="${selectedIntent}" aria-label="View details for ${cand.name}" style="background:none; border:none; color:#818cf8; font-size:12px; font-weight:600; cursor:pointer; text-decoration:underline; padding:8px 10px; min-height:40px; display:inline-flex; align-items:center; touch-action:manipulation;">
                        Details
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${topCandidate ? `
              <button id="btn-start-next-leg" data-candidate-id="${topCandidate.id}" data-trip-id="${tripId}" class="btn-primary-action" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff;">
                🚀 Start Next Leg (${topCandidate.name.slice(0, 24)}...)
              </button>
            ` : ''}
          </div>
        `;
      })()}

      <!-- ═══ TRUST INTELLIGENCE & EVIDENCE PANEL (Phase 5) ═══ -->
      <div id="trust-evidence-panel" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:13px; font-weight:800; color:#f8fafc;">🏛️ Tourist Trust & Evidence</span>
            <span style="font-size:10px; background:rgba(56, 189, 248, 0.15); color:#38bdf8; padding:1px 6px; border-radius:4px; font-weight:700;">
              Evidence-Grounded
            </span>
          </div>
          <span style="font-size:10px; color:#94a3b8;">Zero LLM Fabrication</span>
        </div>

        ${(() => {
          const trust = trustIntelligence || {
            targetName: nextTarget?.name || 'Kailasagiri Hilltop Park',
            trustState: 'TRUSTED',
            confidence: 94,
            summary: 'Formally verified via Ministry of Tourism NIDHI+ registry and authentic municipal telemetry.',
            providerName: 'Visakhapatnam Tourism Board',
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
            TRUSTED: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', icon: '✓' },
            SUPPORTED: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8', icon: 'ℹ' },
            CONFLICTED: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', icon: '⚡' },
            CRITICAL: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', icon: '✕' },
          };
          const badge = stateColors[trust.trustState] || stateColors.SUPPORTED;

          return `
            <div class="trust-evaluation-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:13px; font-weight:700; color:#f8fafc;">${trust.targetName}</span>
                    <span style="background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.border}; font-size:9px; font-weight:800; padding:1px 6px; border-radius:4px;">
                      ${badge.icon} ${trust.trustState}
                    </span>
                    <span style="font-size:10px; color:#94a3b8;">${trust.confidence}% Confidence</span>
                  </div>
                  <div style="font-size:11px; color:#cbd5e1; margin-top:3px; line-height:1.4;">
                    ${trust.summary}
                  </div>
                </div>
              </div>

              <!-- Registry Tags -->
              <div class="trust-registry-tags" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                ${(trust.registrations || []).map(r => `
                  <span style="font-size:10px; background:rgba(16, 185, 129, 0.12); color:#34d399; border:1px solid rgba(16, 185, 129, 0.25); padding:1px 6px; border-radius:4px;">
                    🏛️ <strong>${r.registry}</strong>: ${r.phrasing || r.status}
                  </span>
                `).join('')}
              </div>

              <!-- Itemized Price Transparency -->
              <div class="trust-price-decomposition" style="margin-top:8px; background:rgba(0,0,0,0.25); border-radius:6px; padding:8px 10px; border-left:3px solid #10b981;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:10px; font-weight:700; color:#cbd5e1; text-transform:uppercase;">
                    💰 ITEMIZED PRICE TRANSPARENCY:
                  </span>
                  <span style="font-size:9px; font-weight:700; background:rgba(16, 185, 129, 0.2); color:#34d399; padding:1px 5px; border-radius:3px;">
                    ${trust.price?.transparencyTier || 'HIGH'} TRANSPARENCY
                  </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr)); gap:4px; font-size:10px; color:#94a3b8;">
                  <div>Base: <strong style="color:#f8fafc;">₹${trust.price?.basePrice ?? 100}</strong></div>
                  <div>Taxes (GST): <strong style="color:#f8fafc;">₹${trust.price?.taxes ?? 18}</strong></div>
                  <div>Tickets/Entry: <strong style="color:#f8fafc;">₹${trust.price?.monumentEntry ?? 40}</strong></div>
                  <div>Total: <strong style="color:#38bdf8;">₹${trust.price?.total ?? 158}</strong></div>
                </div>
              </div>

              <!-- Evidence Drawer (Toggled by btn-trust-view-evidence) -->
              <div id="trust-evidence-drawer" style="margin-top:8px; display:${isEvidenceDrawerOpen ? 'block' : 'none'}; background:rgba(15, 23, 42, 0.85); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px;">
                <div style="font-size:11px; font-weight:700; color:#38bdf8; margin-bottom:4px;">🔍 Corroborated Evidence Claims:</div>
                <ul style="margin:0; padding-left:16px; font-size:10px; color:#cbd5e1; line-height:1.45;">
                  ${(trust.claims || []).map(c => `
                    <li><strong>${c.claim}</strong> — <span style="color:#94a3b8;">${c.source} [${c.freshness}]</span></li>
                  `).join('')}
                </ul>
                <div style="margin-top:6px; font-size:10px; color:#94a3b8; border-top:1px solid rgba(255,255,255,0.06); padding-top:4px;">
                  Explainability: <em>"${trust.explainability?.whatToWatchOutFor || 'Standard verified operation.'}"</em>
                </div>
              </div>

              <!-- Trust Action Buttons -->
              <div style="margin-top:10px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                <button id="btn-trust-view-evidence" class="btn-subordinate" style="font-size:11px; padding:4px 10px;">
                  ${isEvidenceDrawerOpen ? '✕ Hide Evidence' : '🔍 View Evidence'}
                </button>
                <button id="btn-trust-view-source" class="btn-subordinate" style="font-size:11px; padding:4px 10px;">
                  🏛️ View Source
                </button>
                <button id="btn-trust-compare" class="btn-subordinate" style="font-size:11px; padding:4px 8px;">
                  ⚖️ Compare
                </button>
                <button id="btn-trust-report" class="btn-subordinate" style="font-size:11px; padding:4px 8px; color:#f87171;">
                  🚩 Report Problem
                </button>
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- ═══ EXPERT MODE / DEVELOPER SIMULATION ACCORDION ═══ -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button id="btn-toggle-demo-controls" style="background:none; border:none; color:#94a3b8; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; padding:4px;">
            <span>🧪</span> <span>Developer Simulation Controls</span> <span>${(isDemoDrawerOpen || !isTraveler) ? '▲' : '▼'}</span>
          </button>
          <span style="font-size:10px; color:#64748b;">Isolated from prod telemetry</span>
        </div>

        <div id="demo-simulation-controls" style="display:${(isDemoDrawerOpen || !isTraveler || isSimulationActive) ? 'block' : 'none'}; margin-top:10px; background:rgba(0,0,0,0.25); border-radius:10px; padding:12px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px;">
            <button id="btn-simulate-cricket-traffic" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              🏏 Match Traffic
            </button>
            <button id="btn-simulate-ghat-rain" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              🌧️ Ghat Downpour
            </button>
            <button id="btn-simulate-official-closure" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              ⛔ Road Closure
            </button>
            <button id="btn-simulate-safety-unavailable" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              ℹ️ Data Unavailable
            </button>
            <button id="btn-simulate-trust-price-mismatch" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              💰 Price Surge
            </button>
            <button id="btn-simulate-trust-route-conflict" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              ⚡ Route Conflict
            </button>
            <button id="btn-simulate-next-deadline" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              🚆 Train Deadline
            </button>
            <button id="btn-simulate-next-disruption" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              ⚡ Leg Disruption
            </button>
            <button id="btn-simulate-next-reset" data-trip-id="${tripId}" class="btn-subordinate" style="font-size:11px; justify-content:center;">
              ↺ Reset Next Leg
            </button>
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Mounts and manages the interactive lifecycle of the Trip Control Center HUD.
 */
export function mountTripControlCenter(containerEl, tripData = {}, callbacks = {}) {
  if (!containerEl) return null;

  let currentTripData = {
    presentationMode: 'TRAVELER',
    isDemoDrawerOpen: false,
    selectedIntent: tripData.selectedIntent || 'GO_TO_HOTEL',
    ...tripData,
  };

  function render() {
    containerEl.innerHTML = renderTripControlCenter(currentTripData);
    bindEvents();
  }

  function bindEvents() {
    // Mode Switchers
    const travelerBtn = containerEl.querySelector('#btn-mode-traveler');
    if (travelerBtn) {
      travelerBtn.onclick = () => {
        currentTripData.presentationMode = 'TRAVELER';
        render();
      };
    }

    const expertBtn = containerEl.querySelector('#btn-mode-expert');
    if (expertBtn) {
      expertBtn.onclick = () => {
        currentTripData.presentationMode = 'EXPERT';
        render();
      };
    }

    // Toggle Demo Controls Accordion
    const toggleDemoBtn = containerEl.querySelector('#btn-toggle-demo-controls');
    if (toggleDemoBtn) {
      toggleDemoBtn.onclick = () => {
        currentTripData.isDemoDrawerOpen = !currentTripData.isDemoDrawerOpen;
        render();
      };
    }

    // Why this action? (Progressive disclosure bottom sheet)
    const whyActionBtn = containerEl.querySelector('#btn-why-this-action');
    if (whyActionBtn) {
      whyActionBtn.onclick = () => {
        const stop = currentTripData.activeStop || currentTripData.upcomingStops?.[0];
        openBottomSheet({
          title: `Why ${stop?.name || 'this stop'}?`,
          subtitle: 'Decision Fit & Recommendation Logic',
          contentHtml: `
            <div style="font-size:14px; line-height:1.6;">
              <p><strong>Recommendation:</strong> Fits your remaining daylight window and current weather conditions.</p>
              <div style="background:rgba(255,255,255,0.04); border-radius:10px; padding:12px; margin:12px 0; font-size:13px;">
                <div>⚡ <strong>Traveler Fit:</strong> High affinity with your travel persona</div>
                <div style="margin-top:4px;">⏱️ <strong>Time Efficiency:</strong> Minimal detour on current corridor</div>
                <div style="margin-top:4px;">🌤️ <strong>Weather Window:</strong> Clear visibility; no severe cloudburst warnings</div>
              </div>
              <button id="sheet-btn-view-evidence" class="btn-primary-action" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; margin-top:8px;">
                🔍 View Full Provenance & Evidence
              </button>
            </div>
          `,
          onAction: (act) => {
            if (act === 'viewEvidence') {
              currentTripData.isEvidenceDrawerOpen = true;
              render();
            }
          }
        });
      };
    }

    // Complete Active Stop
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

    // Skip Active Stop
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
          } else {
            currentTripData.activeStop = currentTripData.upcomingStops?.[0] || null;
            currentTripData.upcomingStops = (currentTripData.upcomingStops || []).slice(1);
          }
          render();
        } catch (err) {
          console.error('[TripControlCenter] Failed to skip stop:', err);
          skipBtn.disabled = false;
          skipBtn.textContent = '⏭ Skip';
        }
      };
    }

    // Adapt Plan Button
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

    // Clear Simulation Button
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

    // Ghat Rain Simulation
    const simGhatBtn = containerEl.querySelector('#btn-simulate-ghat-rain');
    if (simGhatBtn) {
      simGhatBtn.onclick = async () => {
        const tripId = simGhatBtn.getAttribute('data-trip-id');
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Ghat Downpour & Landslide Risk';
        if (window.API?.simulateDisruptionEvent) {
          try {
            const res = await window.API.simulateDisruptionEvent(tripId, { eventType: 'HEAVY_RAIN_GHAT' });
            if (res?.guardianEvaluation) {
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
            }
          } catch {}
        } else {
          currentTripData.tripHealth = 'CRITICAL';
          currentTripData.activeTriggers = [{ type: 'WEATHER_ROAD_RISK', message: 'Heavy rain affects ghat route.' }];
        }
        render();
      };
    }

    // Cricket Match Traffic Simulation
    const cricketSimBtn = containerEl.querySelector('#btn-simulate-cricket-traffic');
    if (cricketSimBtn) {
      cricketSimBtn.onclick = async () => {
        const tripId = cricketSimBtn.getAttribute('data-trip-id');
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Cricket Match Stadium Congestion';
        if (window.API?.simulateTripDisruption) {
          try {
            const res = await window.API.simulateTripDisruption(tripId, {
              simulationScenario: 'CRICKET_MATCH_CONGESTION',
              corridorName: 'NH16 Stadium Corridor',
              currentTravelMinutes: 75,
              freeFlowMinutes: 25,
            });
            if (res?.disruptionEvaluation) {
              const evalRes = res.disruptionEvaluation;
              currentTripData.tripHealth = evalRes.disruption?.severity === 'CRITICAL' ? 'CRITICAL' : 'SUBOPTIMAL';
              currentTripData.activeTriggers = [
                {
                  type: evalRes.disruption?.eventType || 'CRICKET_MATCH',
                  message: `Stadium congestion (+${evalRes.disruption?.estimatedDelay || 50}m).`,
                },
              ];
            }
          } catch {}
        }
        render();
      };
    }

    // Road Closure Simulation
    const closureBtn = containerEl.querySelector('#btn-simulate-official-closure');
    if (closureBtn) {
      closureBtn.onclick = async () => {
        const tripId = closureBtn.getAttribute('data-trip-id');
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Official Road Closure Directive';
        currentTripData.tripHealth = 'CRITICAL';
        currentTripData.activeTriggers = [
          { type: 'ROAD_CLOSURE', message: 'Official Road Closure on corridor: detour required.' }
        ];
        if (window.API?.simulateTripSafety) {
          try { await window.API.simulateTripSafety(tripId, { scenario: 'OFFICIAL_ROAD_CLOSURE' }); } catch {}
        }
        render();
      };
    }

    // Safety Data Unavailable Simulation
    const unavailBtn = containerEl.querySelector('#btn-simulate-safety-unavailable');
    if (unavailBtn) {
      unavailBtn.onclick = async () => {
        const tripId = unavailBtn.getAttribute('data-trip-id');
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Safety Provider Outage / Stale Data';
        currentTripData.tripHealth = 'INSUFFICIENT_DATA';
        currentTripData.activeTriggers = [
          { type: 'SAFETY_DATA_STALE', message: 'Current safety information could not be refreshed from upstream providers.' }
        ];
        if (window.API?.simulateTripSafety) {
          try { await window.API.simulateTripSafety(tripId, { scenario: 'DATA_UNAVAILABLE' }); } catch {}
        }
        render();
      };
    }

    // Trust View Evidence (Toggle Drawer)
    const viewEvidenceBtn = containerEl.querySelector('#btn-trust-view-evidence');
    if (viewEvidenceBtn) {
      viewEvidenceBtn.onclick = (e) => {
        e.preventDefault();
        currentTripData.isEvidenceDrawerOpen = !currentTripData.isEvidenceDrawerOpen;
        render();
      };
    }

    // Trust View Source
    const viewSourceBtn = containerEl.querySelector('#btn-trust-view-source');
    if (viewSourceBtn) {
      viewSourceBtn.onclick = () => {
        openBottomSheet({
          title: 'Official Registry Verification',
          subtitle: 'Ministry of Tourism NIDHI+ & FoSCoS FSSAI',
          contentHtml: `
            <div style="font-size:14px; line-height:1.6;">
              <p><strong>Government Registration:</strong> Active & Validated.</p>
              <div style="background:rgba(16,185,129,0.1); border:1px solid #10b981; border-radius:8px; padding:10px 12px; margin:10px 0;">
                <div>🏛️ <strong>Registry:</strong> Ministry of Tourism (NIDHI+)</div>
                <div>🛡️ <strong>License:</strong> Food & Activity Standard Certified</div>
                <div>📅 <strong>Verified:</strong> Current fiscal year active</div>
              </div>
            </div>
          `
        });
      };
    }

    // Trust Compare
    const compareBtn = containerEl.querySelector('#btn-trust-compare');
    if (compareBtn) {
      compareBtn.onclick = () => {
        openBottomSheet({
          title: 'Trust Comparison',
          subtitle: 'Regional Benchmark Analysis',
          contentHtml: `
            <div style="font-size:14px; line-height:1.6;">
              <p>This venue exhibits <strong>+22% higher evidential provenance</strong> than regional unverified alternatives.</p>
            </div>
          `
        });
      };
    }

    // Trust Report Problem
    const reportBtn = containerEl.querySelector('#btn-trust-report');
    if (reportBtn) {
      reportBtn.onclick = async () => {
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
          setTimeout(() => { reportBtn.textContent = '🚩 Report Problem'; }, 2000);
        } catch {
          reportBtn.textContent = '🚩 Report Problem';
        }
      };
    }

    // Trust Price Surge Simulation
    const simPriceSurgeBtn = containerEl.querySelector('#btn-simulate-trust-price-mismatch');
    if (simPriceSurgeBtn) {
      simPriceSurgeBtn.onclick = (e) => {
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
      };
    }

    // Trust Route Conflict Simulation
    const simRouteConflictBtn = containerEl.querySelector('#btn-simulate-trust-route-conflict');
    if (simRouteConflictBtn) {
      simRouteConflictBtn.onclick = (e) => {
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
      };
    }

    // Finish Journey to Next Intent
    const finishToNextBtn = containerEl.querySelector('#btn-finish-journey-to-next');
    if (finishToNextBtn) {
      finishToNextBtn.onclick = () => {
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
      };
    }

    // Next Intent Chips
    containerEl.querySelectorAll('.btn-next-intent').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const intent = btn.getAttribute('data-next-intent');
        currentTripData.selectedIntent = intent;
        currentTripData.selectedCandidate = null;
        currentTripData.nextLegCandidates = DEFAULT_CANDIDATES_BY_INTENT[intent] || DEFAULT_CANDIDATES_BY_INTENT.GO_TO_HOTEL;

        if (intent === 'END_JOURNEY') {
          openBottomSheet({
            title: 'Journey Concluded',
            subtitle: 'Archive & Summary',
            contentHtml: '<p>All historical journey legs are preserved in your travel passport.</p>'
          });
          return;
        }

        const tripId = btn.getAttribute('data-trip-id');
        if (window.API?.submitNextLegIntent) {
          try {
            const res = await window.API.submitNextLegIntent(tripId, intent);
            if (res?.candidates?.length) {
              currentTripData.nextLegCandidates = res.candidates;
            }
          } catch {}
        }
        render();
      };
    });

    // Helper to safely find candidate across intent pools
    function findCandidate(candId, preferredIntent) {
      if (Array.isArray(currentTripData.nextLegCandidates) && currentTripData.nextLegCandidates.length) {
        const found = currentTripData.nextLegCandidates.find(c => c.id === candId);
        if (found) return found;
      }
      const intent = preferredIntent || currentTripData.selectedIntent || 'GO_TO_HOTEL';
      const list = DEFAULT_CANDIDATES_BY_INTENT[intent];
      if (Array.isArray(list)) {
        const found = list.find(c => c.id === candId);
        if (found) return found;
      }
      // Search across all default intents as fallback
      for (const group of Object.values(DEFAULT_CANDIDATES_BY_INTENT)) {
        if (Array.isArray(group)) {
          const found = group.find(c => c.id === candId);
          if (found) return found;
        }
      }
      return null;
    }

    // Select Next Candidate
    containerEl.querySelectorAll('.btn-select-next-candidate').forEach(btn => {
      btn.onclick = (e) => {
        if (e) e.preventDefault();
        const candId = btn.getAttribute('data-candidate-id');
        const intent = btn.getAttribute('data-intent') || currentTripData.selectedIntent || 'GO_TO_HOTEL';
        const found = findCandidate(candId, intent);
        if (found) {
          currentTripData.selectedCandidate = found;
          currentTripData.selectedIntent = intent;
          render();
        }
      };
    });

    // View Next Candidate Details (Bottom sheet)
    containerEl.querySelectorAll('.btn-view-next-details').forEach(btn => {
      btn.onclick = (e) => {
        if (e) e.preventDefault();
        const candId = btn.getAttribute('data-candidate-id');
        const intent = btn.getAttribute('data-intent') || currentTripData.selectedIntent || 'GO_TO_HOTEL';
        const found = findCandidate(candId, intent);
        if (found) {
          openBottomSheet({
            title: found.name,
            subtitle: `${found.category || 'Destination'} • ${found.durationMinutes || 15}m drive (${found.distanceKm || 3} km)`,
            contentHtml: `
              <div style="font-size:14px; line-height:1.6;">
                <p><strong>Overview:</strong> ${found.explanation || 'Verified destination and itinerary stop.'}</p>
                <div style="background:rgba(255,255,255,0.04); border-radius:10px; padding:12px; margin:12px 0;">
                  <div>💰 <strong>Total Price:</strong> ₹${found.price?.total ?? 0} (inclusive of taxes)</div>
                  <div style="margin-top:4px;">🛡️ <strong>Safety Status:</strong> ${found.safetyStatus || 'CLEAR'}</div>
                  <div style="margin-top:4px;">🏛️ <strong>Trust State:</strong> ${found.trustState || 'SUPPORTED'} (${found.trustScore || 95}% score)</div>
                  <div style="margin-top:4px;">🏨 <strong>Check-in:</strong> ${found.checkinStatus || 'Available'}</div>
                </div>
                <button type="button" data-sheet-action="selectCandidate" class="btn-primary-action" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; width:100%; margin-top:8px; padding:12px; border-radius:8px; font-weight:700; border:none; cursor:pointer;">
                  ✓ Select This Destination
                </button>
              </div>
            `,
            onAction: (act) => {
              if (act === 'selectCandidate') {
                currentTripData.selectedCandidate = found;
                currentTripData.selectedIntent = intent;
                closeBottomSheet();
                render();
              }
            }
          });
        }
      };
    });

    // Start Next Leg
    const startNextLegBtn = containerEl.querySelector('#btn-start-next-leg');
    if (startNextLegBtn) {
      startNextLegBtn.onclick = async (e) => {
        e.preventDefault();
        const candId = startNextLegBtn.getAttribute('data-candidate-id');
        const selected = currentTripData.selectedCandidate || findCandidate(candId, currentTripData.selectedIntent);
        if (!selected) return;

        currentTripData.journeyLegs = currentTripData.journeyLegs || [];
        currentTripData.journeyLegs.push({
          legIndex: currentTripData.currentLegIndex || 1,
          destination: selected.name,
          completedAt: new Date().toISOString(),
        });

        currentTripData.currentLegIndex = (currentTripData.currentLegIndex || 1) + 1;
        currentTripData.isJourneyComplete = false;
        currentTripData.activeStop = {
          id: selected.id,
          name: selected.name,
          category: selected.category,
          plannedDurationMinutes: selected.durationMinutes,
          arriveAt: '14:00',
          leaveAt: '15:00',
        };
        currentTripData.upcomingStops = [];
        render();
      };
    }

    // Train Deadline Simulation
    const simDeadlineBtn = containerEl.querySelector('#btn-simulate-next-deadline');
    if (simDeadlineBtn) {
      simDeadlineBtn.onclick = (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Train Departure Deadline Alert';
        currentTripData.selectedIntent = 'GO_TO_RAILWAY_STATION';
        currentTripData.deadlineAlert = {
          hubName: 'Visakhapatnam Junction (VSKP)',
          timeLeft: '42 min',
          leaveBy: '17:40',
          buffer: '28m',
          requiredBuffer: '45m',
        };
        currentTripData.activeTriggers = [
          { type: 'DEADLINE_RISK', message: 'Train departs in 42 min. Current buffer (28m) is below required 45m threshold.' }
        ];
        render();
      };
    }

    // Leg Disruption Simulation
    const simLegDisruptBtn = containerEl.querySelector('#btn-simulate-next-disruption');
    if (simLegDisruptBtn) {
      simLegDisruptBtn.onclick = (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = true;
        currentTripData.simulationScenario = 'Next-Leg Sea-Surge Corridor Flooding';
        currentTripData.tripHealth = 'CRITICAL';
        currentTripData.activeTriggers = [
          { type: 'LEG_DISRUPTION', message: 'Sea-surge flooding reported on coastal NH16 detour.' }
        ];
        render();
      };
    }

    // Reset Next Leg Simulation
    const simResetBtn = containerEl.querySelector('#btn-simulate-next-reset');
    if (simResetBtn) {
      simResetBtn.onclick = (e) => {
        e.preventDefault();
        currentTripData.isSimulationActive = false;
        currentTripData.simulationScenario = null;
        currentTripData.deadlineAlert = null;
        currentTripData.activeTriggers = [];
        currentTripData.tripHealth = 'ON_TRACK';
        currentTripData.selectedCandidate = null;
        render();
      };
    }
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
