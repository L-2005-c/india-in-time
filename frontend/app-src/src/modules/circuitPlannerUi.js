// frontend/app-src/src/modules/circuitPlannerUi.js
'use strict';

/**
 * Circuit Planner UI Module
 * Orchestrates multi-day regional circuits (Paderu/Alluri, Tirupati, etc.)
 * by connecting to the GeoAI circuit planner API and formatting day tabs.
 */

export async function executeRegionalCircuit(opts = {}) {
  const citySelect = document.getElementById('city-select');
  const region = opts.region || citySelect?.value || 'paderu';
  const numDays = Number(opts.numDays) || 3;

  if (typeof window._showMicroToast === 'function') {
    window._showMicroToast(`Planning ${numDays}-Day Regional Circuit for ${region.toUpperCase()}…`, { icon: '⛰️' });
  }

  try {
    let circuitData = null;
    if (window.API?.timeIntelligenceCircuitPlan) {
      circuitData = await window.API.timeIntelligenceCircuitPlan([], {
        region,
        numDays,
        fromCoords: (Number.isFinite(window.cLat) && Number.isFinite(window.cLon)) ? [window.cLat, window.cLon] : null,
      });
    } else {
      const res = await fetch('/api/time-intelligence/circuit-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, numDays }),
      });
      if (res.ok) {
        circuitData = await res.json();
      }
    }

    if (!circuitData || !Array.isArray(circuitData.dayPlans) || !circuitData.dayPlans.length) {
      throw new Error('No circuit plan returned');
    }

    // Format day plans into mdPlan format
    const multiDays = circuitData.dayPlans.map((dp, dIdx) => {
      const stops = Array.isArray(dp.stops) ? dp.stops : [];
      return stops.map((s, sIdx) => ({
        ...s,
        id: s.id || `${s.name.replace(/\s+/g, '_').toLowerCase()}_d${dIdx + 1}_s${sIdx + 1}`,
        cat: s.cat || s.category || 'scenic',
        vt: s.stayMinutes || s.durationMin || 45,
        tt: s.travelMinutes || 0,
        sts: s.time || s.arriveAt || s.arrivalTime || (dIdx === 1 && sIdx === 0 ? '04:30 AM' : '09:00 AM'),
        ets: s.leaveAt || '10:00 AM',
        slotLabel: s.slotLabel || (dIdx === 1 && sIdx === 0 ? '☁️ Dawn Cloud Inversion' : `Day ${dIdx + 1}`),
        subCircuitTheme: dp.theme,
        recommendedHub: dp.recommendedHub,
      }));
    });

    const encoded = encodeURIComponent(JSON.stringify({
      data: JSON.stringify(multiDays),
      st: circuitData.dayPlans[0]?.startTime || '08:30',
      et: '19:30',
      tm: 660,
    }));

    if (typeof window.loadPlan === 'function') {
      window.loadPlan(encoded);
    }
    if (typeof window.updateDayTabs === 'function') {
      window.updateDayTabs(multiDays.length, 0);
    }

    // Update banner & toast
    if (typeof window._showMicroToast === 'function') {
      window._showMicroToast(`✨ Activated ${circuitData.circuitName || 'Regional Circuit'}!`, { icon: '🗺️' });
    }

    const summaryTitle = document.getElementById('plan-summary-title');
    if (summaryTitle && circuitData.circuitName) {
      summaryTitle.textContent = circuitData.circuitName;
    }

    const summaryDays = document.getElementById('plan-summary-chip-days');
    if (summaryDays) {
      summaryDays.textContent = `${circuitData.totalDays || numDays} Days Circuit`;
    }

    return circuitData;
  } catch (err) {
    console.warn('[circuitPlannerUi]', err);
    if (typeof window.addMsg === 'function') {
      window.addMsg(`⚠️ Could not plan circuit for ${region}. Generating standard itinerary instead.`);
    }
    if (typeof window.generatePlan === 'function') {
      window.generatePlan();
    }
    return null;
  }
}

export const REGIONAL_CIRCUITS = [
  {
    id: 'eastern_ghats',
    region: 'paderu',
    numDays: 3,
    title: 'Eastern Ghats Misty Heights Circuit',
    daysLabel: '3 Days / 2 Nights',
    hubCity: 'Visakhapatnam & Paderu',
    pills: ['☁️ Cloud Inversion', '☕ Arabica Plantations', '🚆 Vistadome Rail (58 Tunnels)', '⛰️ Lambasingi Chill'],
    description: 'Traverse coastal Vizag to Araku Valley via 58 scenic railway tunnels, hike to Vanjangi Meghala Konda for 4:30 AM sunrise cloud sea, and retreat to Lambasingi misty pine groves.',
    highlightStops: ['Vanjangi Cloud Peak', 'Borra Caves', 'Araku Coffee Museum', 'Katiki Falls', 'Lambasingi Pines'],
  },
  {
    id: 'tirupati_heritage',
    region: 'tirupati',
    numDays: 2,
    title: 'Tirupati Seshachalam Sacred Heritage Circuit',
    daysLabel: '2 Days / 1 Night',
    hubCity: 'Tirupati & Tirumala',
    pills: ['🛕 Divya Darshan', '⛰️ Srivari Mettu Trail', '🌿 Talakona Bio-Reserve', '🏰 Chandragiri Fort'],
    description: 'Ascend the ancient stone footpaths of Seshachalam Hills, partake in sacred Darshan, witness Chandragiri Fort sound & light heritage, and trek into Talakona waterfalls canopy.',
    highlightStops: ['Tirumala Venkateswara Temple', 'Srivari Mettu Trek', 'Chandragiri Fort', 'Talakona Waterfalls', 'Padmavathi Ammavari Temple'],
  },
  {
    id: 'krishna_riverfront',
    region: 'vijayawada',
    numDays: 2,
    title: 'Krishna Riverfront & Monolithic Caves Circuit',
    daysLabel: '2 Days / 1 Night',
    hubCity: 'Vijayawada',
    pills: ['🛕 Kanaka Durga Temple', '🗿 Undavalli Rock-Cut Caves', '🏝️ Bhavani Island', '🎨 Kondapalli Toys'],
    description: 'Seek blessings at hilltop Kanaka Durga shrine overlooking Prakasam Barrage, explore 7th-century rock-cut monolithic caves at Undavalli, and sail to secluded Bhavani Island.',
    highlightStops: ['Kanaka Durga Temple', 'Prakasam Barrage Promenade', 'Undavalli Caves', 'Bhavani Island', 'Kondapalli Fort & Toy Village'],
  },
  {
    id: 'coastal_malabar',
    region: 'munnar',
    numDays: 3,
    title: 'Coastal Malabar & Western Ghats High-Ridge Circuit',
    daysLabel: '3 Days / 2 Nights',
    hubCity: 'Kochi & Munnar',
    pills: ['🛶 Chinese Fishing Nets', '🍃 Kolukkumalai Organic Tea', '🦌 Nilgiri Tahr', '⛰️ Top Station Ridge'],
    description: 'Blend colonial Fort Kochi coastal ramparts and Jew Town with an ascent to the world\'s highest organic tea plantations at Kolukkumalai and mist-shrouded Eravikulam peaks.',
    highlightStops: ['Chinese Fishing Nets', 'Eravikulam National Park', 'Mattupetty Dam', 'Kolukkumalai Tea Estate', 'Top Station Cloud Viewpoint'],
  },
];

export function openCircuitSelectionModal() {
  let overlay = document.getElementById('circuit-modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'circuit-modal-overlay';
  overlay.className = 'circuit-modal-overlay';

  const cardsHtml = REGIONAL_CIRCUITS.map((c) => {
    const pillsHtml = c.pills.map(p => `<span class="circuit-card-pill">${p}</span>`).join('');
    const stopsList = c.highlightStops.join(' → ');
    return `
      <div class="circuit-card-item">
        <div class="circuit-card-head">
          <div>
            <div class="circuit-card-name">${c.title}</div>
            <div class="circuit-card-meta">📍 ${c.hubCity} · ⏱️ ${c.daysLabel}</div>
          </div>
        </div>
        <p class="circuit-card-desc">${c.description}</p>
        <div class="circuit-card-pills">${pillsHtml}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
          <strong style="color:#cbd5e1;">Key Stops:</strong> ${stopsList}
        </div>
        <div class="circuit-card-actions">
          <button type="button" class="btn-select-circuit" data-circuit-region="${c.region}" data-circuit-days="${c.numDays}">
            <span>Activate Circuit</span> <span>→</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="circuit-modal-dialog">
      <div class="circuit-modal-header">
        <div class="circuit-modal-title">
          <span>🗺️</span> Regional Multi-Day Circuit Explorer
        </div>
        <button type="button" class="circuit-modal-close" aria-label="Close Circuit Explorer">×</button>
      </div>
      <div class="circuit-modal-body">
        ${cardsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.circuit-modal-close');
  const closeFn = () => overlay.remove();
  closeBtn?.addEventListener('click', closeFn);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFn();
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeFn();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const actionButtons = overlay.querySelectorAll('.btn-select-circuit');
  actionButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const region = btn.dataset.circuitRegion;
      const numDays = Number(btn.dataset.circuitDays) || 3;
      const citySelect = document.getElementById('city-select');
      if (citySelect && region) {
        citySelect.value = region;
        citySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeFn();
      executeRegionalCircuit({ region, numDays });
    });
  });
}
