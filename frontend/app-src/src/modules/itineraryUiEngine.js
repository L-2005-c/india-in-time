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
  const startTime = stop?.arrivalTime || stop?.time || '10:00 AM';
  const duration = stop?.durationMin ? `${stop.durationMin}m` : '45m';

  const goldenHourHtml = goldenHour
    ? `<span class="stop-intel-chip chip-golden-hour" title="Best lighting and calmest breeze">${goldenHour.icon} ${goldenHour.label}</span>`
    : '';

  const dishHtml = signatureDish
    ? `<span class="stop-intel-chip chip-signature-dish" data-action="openDishModal" data-dish="${signatureDish}" title="Top culinary recommendation near this stop">🍛 ${signatureDish}</span>`
    : '';

  const protocolHtml = stop?.dressCode || stop?.entryProtocol
    ? `<span class="stop-intel-chip chip-cultural-protocol" title="${stop.entryProtocol || 'Cover shoulders/knees'}">🏛️ ${stop.dressCode || 'Entry Protocol'}</span>`
    : '';

  const transitHtml = transitNext
    ? `
    <div class="transit-connector-card">
      <span class="transit-mode-icon">${transitNext.mode === 'walk' ? '🚶' : '🚗'}</span>
      <span>${transitNext.mode === 'walk' ? 'Walk to next stop' : 'Drive via scenic corridor'}</span>
      <span class="transit-duration">${transitNext.duration || '12m'}</span>
      <span class="transit-traffic-badge ${transitNext.traffic === 'slow' ? 'traffic-slow' : 'traffic-clear'}">
        ${transitNext.traffic === 'slow' ? '🔴 Heavy Traffic' : '🟢 Smooth Flow'}
      </span>
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
        ${goldenHourHtml}
        ${dishHtml}
        ${protocolHtml}
      </div>

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
