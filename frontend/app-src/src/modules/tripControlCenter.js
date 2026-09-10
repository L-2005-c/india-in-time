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
  pacingLagMinutes = 0,
  activeTriggers = [],
  lastAdaptation = null,
} = {}) {
  const healthBadges = {
    ON_TRACK: { icon: '🟢', label: 'Trip is On Track', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    WATCH: { icon: '🟡', label: 'Watch Active', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    SUBOPTIMAL: { icon: '🟠', label: 'Suboptimal Conditions', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },
    CRITICAL: { icon: '🔴', label: 'Adaptation Required', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    REPLAN_RECOMMENDED: { icon: '⚠️', label: 'Replan Recommended', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
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

      <!-- Killer Demo Simulation Controls -->
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:11px; color:#94a3b8;">
          <span style="font-weight:700; color:#cbd5e1;">Demo Reality Simulator:</span> Introduce controlled mountain weather shift
        </div>
        <button id="btn-simulate-ghat-rain" data-trip-id="${tripId}" style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <span>🌧️</span> Simulate Ghat Road Downpour
        </button>
      </div>
    </div>
  `;
}
