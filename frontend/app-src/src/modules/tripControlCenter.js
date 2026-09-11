/**
 * frontend/app-src/src/modules/tripControlCenter.js
 *
 * India In-Time v3.0 Trip Control Center & Real-Time Travel Guardian UI.
 * Provides active trip HUD, immutable completed stop history, live disruption alerts,
 * one-click contextual plan adaptation, and controlled demo simulation.
 */

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
} = {}) {
  const healthBadges = {
    ON_TRACK: { icon: '🟢', label: 'Trip is On Track', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    WATCH: { icon: '🟡', label: 'Watch Active', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    SUBOPTIMAL: { icon: '🟠', label: 'Suboptimal Conditions', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },
    CRITICAL: { icon: '🔴', label: 'Adaptation Required', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    REPLAN_RECOMMENDED: { icon: '⚠️', label: 'Replan Recommended', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_CAUTION: { icon: '🛡️', label: 'Safety Caution', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
    SAFETY_ACTION_RECOMMENDED: { icon: '⚠️', label: 'Safety Action Recommended', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
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
            <div style="display:flex; gap:8px;">
              <button id="btn-complete-active-stop" data-stop-id="${activeStop.id}" data-trip-id="${tripId}" style="background:#10b981; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer;">
                ✓ Mark Completed
              </button>
              <button id="btn-skip-active-stop" data-stop-id="${activeStop.id}" data-trip-id="${tripId}" style="background:rgba(255,255,255,0.1); color:#cbd5e1; border:none; border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer;">
                ⏭ Skip
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

      <!-- Safety Data Sources & Ground-Truth Telemetry Status (Section 36) -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>🛡️ Safety Data Sources & Ground-Truth Telemetry:</span>
          <span style="font-size:10px; color:#64748b;">Deterministic Rules • Zero LLM Fabrication</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(16,185,129,0.2); border-radius:6px; padding:6px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#f8fafc;">NDMA SACHET</span>
              <span style="background:rgba(16,185,129,0.2); color:#10b981; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">LIVE</span>
            </div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Official CAP Disaster & Evacuation Alerts</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(16,185,129,0.2); border-radius:6px; padding:6px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#f8fafc;">IMD Mausam</span>
              <span style="background:rgba(16,185,129,0.2); color:#10b981; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">LIVE</span>
            </div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Official District Color Warnings (750+ Dists)</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(245,158,11,0.2); border-radius:6px; padding:6px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#f8fafc;">CWC Flood Service</span>
              <span style="background:rgba(245,158,11,0.2); color:#f59e0b; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">PARTIALLY_AVAILABLE</span>
            </div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Public Daily Bulletins (Machine GIS IAM-protected)</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(245,158,11,0.2); border-radius:6px; padding:6px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#f8fafc;">FSI Forest Fire</span>
              <span style="background:rgba(245,158,11,0.2); color:#f59e0b; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px;">PARTIALLY_AVAILABLE</span>
            </div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Portal Monitoring & Satellite Thermal Anomalies</div>
          </div>
        </div>
      </div>

      <!-- Killer Demo Simulation Controls -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="font-size:11px; color:#94a3b8;">
          <span style="font-weight:700; color:#cbd5e1;">Demo Reality Simulator:</span> Controlled disruption injection (SIMULATED)
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
              if (callbacks.onProgress) callbacks.onProgress(res);
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

    const simBtn = containerEl.querySelector('#btn-simulate-ghat-rain');
    if (simBtn) {
      simBtn.onclick = async () => {
        const tripId = simBtn.getAttribute('data-trip-id');
        try {
          simBtn.disabled = true;
          simBtn.textContent = 'Simulating...';
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
          simBtn.textContent = '🌧️ Simulate Ghat Downpour';
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
  if (!containerEl || !Array.isArray(tripPlan) || !tripPlan.length || !window.API?.initJourneyState) return null;
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

  try {
    const st = await window.API.initJourneyState(tripId, flatStops, travelerDna);
    return mountTripControlCenter(containerEl, {
      tripId,
      planVersion: st?.activePlanVersion || 1,
      tripHealth: st?.tripHealth || 'ON_TRACK',
      activeStop: st?.activeStop || flatStops[0],
      completedStops: [],
      upcomingStops: st?.upcomingStops || flatStops.slice(1),
    });
  } catch (err) {
    console.warn('[TripControlCenter] Init failed:', err);
    return null;
  }
}


