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
