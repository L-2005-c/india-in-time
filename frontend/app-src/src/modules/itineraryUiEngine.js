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

  const transitHtml = transitNext
    ? `
    <div class="transit-connector-card">
      <span class="transit-mode-icon">${transitModeIcon}</span>
      <span>${transitModeLabel}</span>
      <span class="transit-duration">${transitNext.duration || '12m'}</span>
      <span class="transit-traffic-badge ${transitNext.traffic === 'slow' ? 'traffic-slow' : 'traffic-clear'}">
        ${transitNext.traffic === 'slow' ? '🔴 Heavy Traffic' : '🟢 Smooth Flow'}
      </span>
      ${transitGhatHtml}
    </div>
  `
    : '';

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
        <span class="stop-intel-chip ${crowd.class}" title="Real-time predictive crowd estimate">👥 ${crowd.label}</span>
        ${cloudInversionHtml}
        ${sanctumAlertHtml}
        ${comfortHtml}
        ${goldenHourHtml}
        ${dishHtml}
        ${protocolHtml}
      </div>

      ${whyNowHtml}

      <div class="stop-crowd-meter">
        <span class="crowd-meter-label">Live Crowd</span>
        <div class="crowd-meter-track">
          <div class="crowd-meter-fill ${crowd.fillClass}" style="width: ${crowd.percent}%;"></div>
        </div>
        <span style="font-family:'Space Mono',monospace;font-size:10.5px;color:var(--text-muted);font-weight:700;">${crowd.percent}%</span>
      </div>
    </div>
    ${transitHtml}
  `;
}
