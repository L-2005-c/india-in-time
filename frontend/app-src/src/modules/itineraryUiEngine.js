/**
 * FAANG-Grade Itinerary UI Engine
 * Renders interactive stop cards with live crowd metrics, golden hour timers,
 * signature dish recommendations, and transit connector cards.
 */

export function calculateCrowdBadge(stop) {
  const crowdScore = stop?.crowdScore || stop?.crowdDensity || 45;
  if (crowdScore < 40) {
    return { label: 'Low Crowd', class: 'chip-crowd-low', fillClass: 'crowd-fill-low', percent: Math.max(20, crowdScore) };
  }
  if (crowdScore < 75) {
    return { label: 'Moderate', class: 'chip-crowd-moderate', fillClass: 'crowd-fill-moderate', percent: crowdScore };
  }
  return { label: 'Peak Hour', class: 'chip-crowd-peak', fillClass: 'crowd-fill-peak', percent: Math.min(100, crowdScore) };
}

export function calculateGoldenHourWindow(stop) {
  // If stop is scenic, nature, beach, or sunset viewpoint
  const tags = Array.isArray(stop?.tags) ? stop.tags.join(' ').toLowerCase() : (stop?.category || '').toLowerCase();
  const isScenic = /scenic|beach|viewpoint|fort|sunset|lake|hill|temple/i.test(tags);
  if (!isScenic) return null;
  return {
    label: 'Golden Hour (16:30 - 18:15)',
    icon: '🌅',
    score: 95,
  };
}

export function getSignatureDish(stop) {
  if (stop?.signatureDish) return stop.signatureDish;
  const foodHints = {
    vizag: 'Bongu Chicken & Madugula Halwa',
    paderu: 'Bongu Kodi Bamboo Chicken & Paderu Arabica Coffee',
    chennai: 'Madras Filter Coffee & Ghee Roast Dosa',
    tirupati: 'Tirupati Laddu Prasadam & Bhimas Andhra Thali',
    vijayawada: 'Babai Hotel Ghee Idli & Ulavacharu Biryani',
    jaipur: 'Pyaaz Kachori & Dal Baati Churma',
    hyderabad: 'Irani Chai & Hyderabadi Biryani',
    delhi: 'Chole Bhature & Parathas',
    goa: 'Fish Curry Rice & Bebinca',
    bengaluru: 'Benne Dosa & Filter Coffee',
    kochi: 'Appam with Stew & Karimeen',
    mumbai: 'Vada Pav & Bombay Sandwich',
    agra: 'Agra Petha & Bedmi Puri',
    varanasi: 'Banarasi Paan & Malaiyo',
    kolkata: 'Kathi Roll & Mishti Doi',
    udaipur: 'Gatte ki Sabzi & Ker Sangri',
    mysore: 'Guru Sweets Mysore Pak & Hotel Mylari Dosa',
    munnar: 'Kerala Appam with Stew & Cardamom Tea',
  };
  const cityKey = (stop?.cityKey || window.__appState?.selectedCity || '').toLowerCase();
  return foodHints[cityKey] || 'Local Street Specialty';
}

export function renderFaangStopCard(stop, index, totalStops, transitNext = null) {
  const crowd = calculateCrowdBadge(stop);
  const goldenHour = calculateGoldenHourWindow(stop);
  const signatureDish = getSignatureDish(stop);
  const startTime = stop?.arrivalTime || stop?.time || stop?.arriveAt || '10:00 AM';
  const duration = stop?.durationMin ? `${stop.durationMin}m` : (stop?.stayMinutes ? `${stop.stayMinutes}m` : '45m');

  const goldenHourHtml = goldenHour
    ? `<span class="stop-intel-chip chip-golden-hour" title="Best lighting and calmest breeze">${goldenHour.icon} ${goldenHour.label}</span>`
    : '';

  const dishHtml = signatureDish
    ? `<span class="stop-intel-chip chip-signature-dish" data-action="openDishModal" data-dish="${signatureDish}" title="Top culinary recommendation near this stop">🍛 ${signatureDish}</span>`
    : '';

  const protocolHtml = stop?.dressCode || stop?.entryProtocol
    ? `<span class="stop-intel-chip chip-cultural-protocol" title="${stop.entryProtocol || 'Cover shoulders/knees'}">🏛️ ${stop.dressCode || 'Entry Protocol'}</span>`
    : '';

  // Advanced Time Intelligence Chips
  const cloudInversionHtml = (stop?.cloudInversion || /cloud inversion/i.test(stop?.timePhaseBadge || ''))
    ? `<span class="stop-intel-chip chip-cloud-inversion" title="Peak cloud ocean inversion above the valley">☁️ Cloud Inversion Window</span>`
    : '';

  const sanctumAlertHtml = (stop?.cultural?.isSanctumClosed || stop?.sanctumClosureAlert)
    ? `<span class="stop-intel-chip chip-sanctum-closure" title="Sanctum afternoon closure (12:30-15:30)">🛕 Midday Sanctum Closure (12:30–15:30)</span>`
    : '';

  const sunHarshness = stop?.sunExposure || stop?.sunHarshness;
  const sunHarshnessHtml = (sunHarshness?.isHarshSun || stop?.harshSunWarning)
    ? `<span class="stop-intel-chip chip-sun-harshness" title="${sunHarshness?.guidance || 'Severe midday solar radiation — unshaded stone/beach surface'}">☀️ Midday Sun Warning (Low Shade)</span>`
    : '';

  const darshanQueue = stop?.darshanQueue;
  const darshanQueueHtml = (darshanQueue?.isSacredDarshan || stop?.darshanEstimate)
    ? `<span class="stop-intel-chip chip-darshan-queue" title="Optimal darshan: ${darshanQueue?.recommendedSlot || 'Early morning'}. ${darshanQueue?.tip || ''}">🛕 Darshan Queue ~${darshanQueue?.estimatedWaitMinutes || 45}m (${darshanQueue?.crowdFactor || 'MODERATE'})</span>`
    : '';

  const comfortHtml = stop?.weatherComfortBadge
    ? `<span class="stop-intel-chip chip-comfort-badge" title="Thermal comfort condition">${stop.weatherComfortBadge}</span>`
    : '';

  const reasonsList = Array.isArray(stop?.whyNow?.reasons)
    ? stop.whyNow.reasons
    : Array.isArray(stop?.whyThisTime)
      ? stop.whyThisTime
      : Array.isArray(stop?.reasons)
        ? stop.reasons
        : [];

  const whyNowHtml = reasonsList.length > 0
    ? `<div class="why-now-card">
        <div class="why-now-title">✨ ${stop?.timePhaseBadge || 'Timing Rationale'}</div>
        <ul class="why-now-list">${reasonsList.slice(0, 2).map(r => `<li>${r}</li>`).join('')}</ul>
      </div>`
    : '';

  let transitGhatHtml = '';
  const isVistadome = transitNext?.mode === 'vistadome_rail';
  const isPilgrim = transitNext?.mode === 'pilgrim_express';

  if (transitNext?.isGhatRoad || transitNext?.vehicleAdvisory || transitNext?.nightFogAdvisory || isVistadome || isPilgrim) {
    transitGhatHtml = `
      <div class="transit-mountain-advisory" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;font-size:10px;">
        ${isVistadome ? '<span class="chip-vistadome-rail" style="padding:1px 6px;border-radius:4px;background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.35);">🚆 Vistadome Glass-Coach (58 Tunnels)</span>' : ''}
        ${isPilgrim ? '<span class="chip-pilgrim-express" style="padding:1px 6px;border-radius:4px;background:rgba(245,158,11,0.15);color:#fcd34d;border:1px solid rgba(245,158,11,0.35);">🛕 Pilgrim Express Corridor</span>' : ''}
        ${transitNext.isGhatRoad ? '<span class="chip-ghat-road" style="padding:1px 6px;border-radius:4px;background:rgba(234,179,8,0.15);color:#fde047;border:1px solid rgba(234,179,8,0.3);">⛰️ Mountain Ghat Road</span>' : ''}
        ${transitNext.vehicleAdvisory ? `<span class="chip-4x4-cab" style="padding:1px 6px;border-radius:4px;background:rgba(168,85,247,0.15);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);">${transitNext.vehicleAdvisory}</span>` : ''}
        ${transitNext.nightFogAdvisory ? '<span class="chip-fog-warning" style="padding:1px 6px;border-radius:4px;background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);">⚠️ Night Mountain Fog Caution</span>' : ''}
      </div>
    `;
  }

  const transitModeIcon = isVistadome ? '🚆' : (isPilgrim ? '🚗' : (transitNext?.mode === 'walk' ? '🚶' : '🚗'));
  const transitModeLabel = isVistadome
    ? 'Vistadome Panoramic Railway'
    : (isPilgrim
        ? 'Tirupati Pilgrimage Expressway'
        : (transitNext?.mode === 'walk' ? 'Walk to next stop' : (transitNext?.isGhatRoad ? 'Highland Ghat Transit' : 'Drive via scenic corridor')));

  const isLiveTraffic = transitNext?.provenance === 'LIVE_TRAFFIC' || transitNext?.source === 'live_traffic';
  const trafficBadgeText = isLiveTraffic
    ? (transitNext.traffic === 'slow' ? '🔴 Live: Slow' : '🟢 Live: Smooth Flow')
    : (transitNext?.traffic === 'slow' ? '🟠 Estimated Slowdown' : '🟢 Traffic: Normal');

  const transitHtml = transitNext
    ? `
    <div class="transit-connector-card">
      <span class="transit-mode-icon">${transitModeIcon}</span>
      <span>${transitModeLabel}</span>
      <span class="transit-duration">${transitNext.duration || '12m'}</span>
      <span class="transit-traffic-badge ${transitNext.traffic === 'slow' ? 'traffic-slow' : 'traffic-clear'}">
        ${trafficBadgeText}
      </span>
      ${transitGhatHtml}
    </div>
  `
    : '';

  const isLiveCrowd = Boolean(stop?.crowd?.isLive || stop?.crowd?.source === 'live_sensors');
  const crowdMeterTitle = isLiveCrowd ? 'Live Crowd' : (stop?.crowd?.method === 'HISTORICAL_PATTERN' ? 'Historical Pattern' : 'Predicted Crowd');

  return `
    <div class="faang-stop-card" id="stop-card-${index}" data-stop-idx="${index}" data-action="highlightStopOnMap">
      <div class="stop-card-header">
        <div class="stop-card-title-group">
          <span class="stop-order-chip">${index + 1}</span>
          <h3 class="stop-card-name">${stop.name || 'Attraction'}</h3>
        </div>
        <div class="stop-time-badge">
          <span>🕒</span> ${startTime} · ${duration}
        </div>
      </div>

      <div class="stop-intel-bar">
        <span class="stop-intel-chip ${crowd.class}" title="Predictive crowd density">👥 ${crowd.label}</span>
        ${cloudInversionHtml}
        ${sanctumAlertHtml}
        ${darshanQueueHtml}
        ${sunHarshnessHtml}
        ${comfortHtml}
        ${goldenHourHtml}
        ${dishHtml}
        ${protocolHtml}
      </div>

      ${whyNowHtml}

      <div class="stop-crowd-meter">
        <span class="crowd-meter-label">${crowdMeterTitle}</span>
        <div class="crowd-meter-track">
          <div class="crowd-meter-fill ${crowd.fillClass}" style="width: ${crowd.percent}%;"></div>
        </div>
        <span style="font-family:'Space Mono',monospace;font-size:10.5px;color:var(--text-muted);font-weight:700;">${crowd.percent}%</span>
      </div>
    </div>
    ${transitHtml}
  `;
}

/**
 * Renders glassmorphic shimmer skeleton cards while GeoAI optimizer runs.
 * Provides immediate visual feedback, eliminates layout shift, and ensures 60fps UX.
 * @param {HTMLElement} container
 */
export function renderPlanSkeleton(container) {
  if (!container) return;
  const count = 3;
  let html = `
    <div class="skeleton-optimizing-banner">
      <span class="skeleton-pulse-dot"></span>
      <span>GeoAI Engine is computing optimal times & crowd windows…</span>
    </div>
    <div class="plan-skeleton-wrapper" aria-busy="true" aria-label="Loading itinerary">
  `;
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-circle shimmer"></div>
          <div class="skeleton-bar skeleton-title shimmer"></div>
          <div class="skeleton-pill skeleton-time shimmer"></div>
        </div>
        <div class="skeleton-chips">
          <div class="skeleton-pill shimmer" style="width: 80px;"></div>
          <div class="skeleton-pill shimmer" style="width: 110px;"></div>
          <div class="skeleton-pill shimmer" style="width: 95px;"></div>
        </div>
        <div class="skeleton-meter-row">
          <div class="skeleton-bar shimmer" style="width: 70px; height: 12px;"></div>
          <div class="skeleton-bar skeleton-progress shimmer"></div>
        </div>
      </div>
    `;
    if (i < count - 1) {
      html += `
        <div class="skeleton-transit-connector">
          <div class="skeleton-transit-track"></div>
          <div class="skeleton-pill skeleton-transit-pill shimmer"></div>
        </div>
      `;
    }
  }
  html += `</div>`;
  container.innerHTML = html;
}

/**
 * Renders the Adaptive Decision HUD for active trip intelligence.
 * @param {HTMLElement} container
 * @param {Object} decisionData - Structured decision from /api/intelligence/decide
 * @param {Function} [onOutcome] - Callback when user accepts or rejects decision
 */
export function renderDecisionHud(container, decisionData, onOutcome) {
  if (!container || !decisionData) return;
  const state = decisionData.decision || 'KEEP_PLAN';
  const nextAction = decisionData.nextAction || {};
  const explanation = decisionData.explanation || {};
  const confidence = decisionData.confidence || 'MEDIUM';
  const planHealth = decisionData.planHealth || {};

  let badgeColor = '#10b981'; // Green
  let badgeIcon = '✓';
  if (state === 'ALTERNATIVE_REQUIRED') {
    badgeColor = '#ef4444'; // Red
    badgeIcon = '⚠️';
  } else if (state === 'ADAPT_PLAN' || state === 'WATCH') {
    badgeColor = '#f59e0b'; // Amber
    badgeIcon = '⚡';
  } else if (state === 'INSUFFICIENT_DATA') {
    badgeColor = '#64748b'; // Slate
    badgeIcon = 'ℹ️';
  }

  const hudHtml = `
    <div class="decision-hud-card" style="margin-bottom:16px;padding:16px;background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:12px;backdrop-filter:blur(16px);color:#f8fafc;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:${badgeColor}22;border:1px solid ${badgeColor};border-radius:20px;font-size:12px;font-weight:700;color:${badgeColor};text-transform:uppercase;letter-spacing:0.5px;">
            ${badgeIcon} ${state.replace('_', ' ')}
          </span>
          <span style="font-size:12px;color:#94a3b8;">Confidence: <strong style="color:#f8fafc;">${confidence}</strong></span>
        </div>
        <span style="font-size:11px;color:#64748b;font-family:'Space Mono',monospace;">v3.0 Decision Engine</span>
      </div>

      <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:6px;">
        ${explanation.what || nextAction.actionType || 'Plan Active'}
      </div>

      <div style="font-size:12.5px;color:#cbd5e1;line-height:1.5;margin-bottom:12px;">
        ${explanation.why || 'Itinerary is actively monitored against live weather, traffic, and your travel DNA.'}
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;font-size:11px;">
        <span style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;color:#94a3b8;">Weather: <strong style="color:#e2e8f0;">${planHealth.weatherHealth || 'HEALTHY'}</strong></span>
        <span style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;color:#94a3b8;">Route: <strong style="color:#e2e8f0;">${planHealth.routeHealth || 'CLEAR'}</strong></span>
        <span style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;color:#94a3b8;">Pacing: <strong style="color:#e2e8f0;">${planHealth.scheduleHealth || 'ON_TRACK'}</strong></span>
        <span style="padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;color:#94a3b8;">Crowd: <strong style="color:#e2e8f0;">${planHealth.crowdHealth || 'COMFORTABLE'}</strong></span>
      </div>

      ${state !== 'KEEP_PLAN' && state !== 'INSUFFICIENT_DATA' ? `
        <div style="display:flex;gap:8px;">
          <button id="btn-decision-accept" style="flex:1;padding:8px 12px;background:#3b82f6;color:#ffffff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s;">
            Accept Adaptation
          </button>
          <button id="btn-decision-keep" style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.12);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
            Keep Original
          </button>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = hudHtml;

  const btnAccept = container.querySelector('#btn-decision-accept');
  const btnKeep = container.querySelector('#btn-decision-keep');
  if (btnAccept && onOutcome) {
    btnAccept.addEventListener('click', () => onOutcome('ACCEPTED', decisionData));
  }
  if (btnKeep && onOutcome) {
    btnKeep.addEventListener('click', () => onOutcome('REJECTED', decisionData));
  }
}

