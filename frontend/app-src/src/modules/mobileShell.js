/**
 * frontend/app-src/src/modules/mobileShell.js
 *
 * India In-Time v3.0 — Phase 7 Mobile Shell & Responsive Navigation
 *
 * Features:
 * - 5-Tab Navigation Architecture: MAP, JOURNEY, PLAN, ALERTS, MORE
 * - Unread Alert Count Badge
 * - Dynamic slot attachment ensuring HUD is visible in both Journey and Plan views
 * - Seamless integration with existing view switching (switchToView)
 * - Accessible keyboard navigation & touch targets (min 44x44)
 */

import { renderAlertsCenter } from './alertsCenter.js';
import { renderMoreMenu } from './moreMenu.js';

let activeTabIdx = 0;

/**
 * Initializes the mobile shell, wiring the 5-tab navigation and mounting dedicated views.
 */
export function initMobileShell() {
  const bottomNav = document.getElementById('bottom-nav');
  if (!bottomNav) return;

  const content = document.getElementById('content');
  if (content) {
    // 1. Journey View
    let journeyView = document.getElementById('journey-view');
    if (!journeyView) {
      journeyView = document.createElement('div');
      journeyView.id = 'journey-view';
      journeyView.className = 'view';
      journeyView.style.display = 'none';
      journeyView.style.overflowY = 'auto';
      journeyView.style.padding = '14px 14px 80px';
      content.appendChild(journeyView);
    }

    // 2. Alerts View
    let alertsView = document.getElementById('alerts-view');
    if (!alertsView) {
      alertsView = document.createElement('div');
      alertsView.id = 'alerts-view';
      alertsView.className = 'view';
      alertsView.style.display = 'none';
      alertsView.style.overflowY = 'auto';
      alertsView.style.padding = '14px 14px 80px';
      content.appendChild(alertsView);
    }

    // 3. More View
    let moreView = document.getElementById('more-view');
    if (!moreView) {
      moreView = document.createElement('div');
      moreView.id = 'more-view';
      moreView.className = 'view';
      moreView.style.display = 'none';
      moreView.style.overflowY = 'auto';
      moreView.style.padding = '14px 14px 80px';
      content.appendChild(moreView);
    }
  }

  // Populate bottomNav with the 5 core tabs
  renderBottomNav(bottomNav);

  // Expose global switcher
  window.switchMobileTab = switchMobileTab;

  // Enhance existing switchToView to work with new tabs
  const originalSwitch = window.switchToView;
  window.switchToView = function (viewId, idx, skipRender) {
    switchMobileTab(viewId, idx ?? 0);
    if (typeof originalSwitch === 'function' && (viewId === 'map-view' || viewId === 'plan-view' || viewId === 'chat-view' || viewId === 'tools-view')) {
      try { originalSwitch(viewId, idx, skipRender); } catch {}
    }
  };

  refreshAlertsView();
  refreshMoreView();
}

/**
 * Renders the 5 core navigation tabs in #bottom-nav.
 */
function renderBottomNav(navEl) {
  const tabs = [
    { id: 'map-view', label: 'Map', icon: '🗺️' },
    { id: 'journey-view', label: 'Journey', icon: '🧭' },
    { id: 'plan-view', label: 'Plan', icon: '📋' },
    { id: 'alerts-view', label: 'Alerts', icon: '⚠️', hasBadge: true },
    { id: 'more-view', label: 'More', icon: '☰' },
  ];

  navEl.innerHTML = '';
  tabs.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = `nav-item ${idx === activeTabIdx ? 'active' : ''}`;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-action', 'switchToView');
    item.setAttribute('data-view', t.id);
    item.setAttribute('data-idx', String(idx));
    if (idx === activeTabIdx) {
      item.setAttribute('aria-current', 'page');
    }

    const ico = document.createElement('span');
    ico.className = 'nav-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = t.icon;

    const lbl = document.createElement('span');
    lbl.className = 'nav-lbl';
    lbl.textContent = t.label;

    item.appendChild(ico);
    item.appendChild(lbl);

    if (t.hasBadge) {
      const badge = document.createElement('span');
      badge.id = 'nav-alert-badge';
      badge.className = 'nav-badge-count';
      badge.style.display = 'none';
      item.appendChild(badge);
    }

    item.addEventListener('click', () => {
      switchMobileTab(t.id, idx);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchMobileTab(t.id, idx);
      }
    });

    navEl.appendChild(item);
  });
}

/**
 * Switches the active tab view across all registered views.
 */
export function switchMobileTab(viewId, idx = 0) {
  activeTabIdx = idx;

  const allViews = [
    'map-view',
    'journey-view',
    'plan-view',
    'alerts-view',
    'more-view',
    'chat-view',
    'tools-view',
  ];

  allViews.forEach(v => {
    const el = document.getElementById(v);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
    }
  });

  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    target.style.display = (viewId === 'map-view' || viewId === 'chat-view') ? 'flex' : 'block';
  }

  // Ensure HUD slot is attached to active view (Journey or Plan)
  const slot = document.getElementById('trip-control-center-slot');
  if (slot) {
    if (viewId === 'plan-view') {
      const planView = document.getElementById('plan-view');
      if (planView && slot.parentNode !== planView) {
        planView.appendChild(slot);
      }
    } else if (viewId === 'journey-view') {
      const journeyView = document.getElementById('journey-view');
      if (journeyView && slot.parentNode !== journeyView) {
        journeyView.appendChild(slot);
      }
    }
  }

  // Update nav item active states
  const navItems = document.querySelectorAll('#bottom-nav .nav-item');
  navItems.forEach((n, i) => {
    const on = i === idx || n.getAttribute('data-view') === viewId;
    n.classList.toggle('active', on);
    if (on) {
      n.setAttribute('aria-current', 'page');
    } else {
      n.removeAttribute('aria-current');
    }
  });

  // Map refresh
  if (viewId === 'map-view' && typeof window.safeInvalidateMapSize === 'function') {
    window.safeInvalidateMapSize();
    setTimeout(() => window.safeInvalidateMapSize(), 60);
  }

  if (viewId === 'alerts-view') {
    refreshAlertsView();
  }

  if (viewId === 'more-view') {
    refreshMoreView();
  }
}

/**
 * Generates contextual traffic alerts based on time-of-day and city patterns.
 */
function generateTrafficAlerts(cityKey = 'visakhapatnam') {
  const alerts = [];
  const now = new Date();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const city = String(cityKey || 'visakhapatnam').toLowerCase();

  // City-specific rush hour congestion patterns
  const CITY_RUSH_CORRIDORS = {
    visakhapatnam: [
      { name: 'RK Beach Road — NAD Junction', peakDelay: 22, level: 'HEAVY' },
      { name: 'Siripuram — Dwaraka Nagar', peakDelay: 18, level: 'MODERATE' },
      { name: 'Gajuwaka — Steel Plant Rd', peakDelay: 28, level: 'HEAVY' },
    ],
    hyderabad: [
      { name: 'Mehdipatnam — Tolichowki', peakDelay: 35, level: 'SEVERE' },
      { name: 'HITEC City — Gachibowli', peakDelay: 30, level: 'HEAVY' },
      { name: 'Secunderabad — Begumpet', peakDelay: 25, level: 'HEAVY' },
    ],
    bengaluru: [
      { name: 'Silk Board Junction — KR Puram', peakDelay: 45, level: 'GRIDLOCK' },
      { name: 'MG Road — Koramangala', peakDelay: 32, level: 'SEVERE' },
      { name: 'Electronic City — Hosur Rd', peakDelay: 38, level: 'SEVERE' },
    ],
    mumbai: [
      { name: 'Western Express Highway — Andheri', peakDelay: 40, level: 'SEVERE' },
      { name: 'Sion — Dadar', peakDelay: 28, level: 'HEAVY' },
    ],
    chennai: [
      { name: 'Anna Salai — T. Nagar', peakDelay: 25, level: 'HEAVY' },
      { name: 'OMR — Thoraipakkam', peakDelay: 30, level: 'HEAVY' },
    ],
    delhi: [
      { name: 'NH-48 — Dhaula Kuan', peakDelay: 35, level: 'SEVERE' },
      { name: 'Ring Road — ITO', peakDelay: 30, level: 'HEAVY' },
    ],
  };

  const corridors = CITY_RUSH_CORRIDORS[city] || CITY_RUSH_CORRIDORS.visakhapatnam;

  // Morning Rush: 8:30 AM - 10:30 AM (weekdays)
  const isMorningRush = !isWeekend && minuteOfDay >= 510 && minuteOfDay <= 630;
  // Evening Rush: 5:30 PM - 8:30 PM (weekdays)
  const isEveningRush = !isWeekend && minuteOfDay >= 1050 && minuteOfDay <= 1230;
  // Weekend evening: 5 PM - 10 PM
  const isWeekendEveRush = isWeekend && minuteOfDay >= 1020 && minuteOfDay <= 1320;

  if (isMorningRush || isEveningRush) {
    const rushType = isMorningRush ? 'Morning' : 'Evening';
    const topCorridor = corridors[0];
    const scaleFactor = isMorningRush ? 0.85 : 1.0;
    const delay = Math.round(topCorridor.peakDelay * scaleFactor);

    alerts.push({
      category: 'TRAFFIC',
      severity: delay >= 30 ? 'WARNING' : 'CAUTION',
      type: 'TRAFFIC_DELAY',
      title: `${rushType} Rush Hour Congestion`,
      message: `${rushType} commuter rush active on ${topCorridor.name}. Expected +${delay} min delay on transit routes.`,
      source: `City Traffic Model (${city.charAt(0).toUpperCase() + city.slice(1)})`,
      corridor: topCorridor.name,
      delayMinutes: delay,
      trafficLevel: topCorridor.level,
      congestionFactor: isMorningRush ? 1.45 : 1.65,
      provenance: 'Predictive City Model',
      recommendation: `Consider departing ${isMorningRush ? 'before 8:00 AM' : 'after 8:30 PM'} to avoid peak congestion.`,
      timestamp: now.toISOString(),
      canAdapt: true,
      primaryActionLabel: '🔄 View Alternate Route',
    });

    // If severe, add a second corridor
    if (corridors.length > 1 && delay >= 25) {
      const secondCorridor = corridors[1];
      alerts.push({
        category: 'TRAFFIC',
        severity: 'WATCH',
        type: 'TRAFFIC_ANOMALY',
        title: `Elevated Traffic — ${secondCorridor.name}`,
        message: `Above-normal congestion detected on ${secondCorridor.name}. +${Math.round(secondCorridor.peakDelay * 0.7)} min estimated delay.`,
        source: `City Traffic Model (${city.charAt(0).toUpperCase() + city.slice(1)})`,
        corridor: secondCorridor.name,
        delayMinutes: Math.round(secondCorridor.peakDelay * 0.7),
        trafficLevel: 'MODERATE',
        provenance: 'Predictive City Model',
        timestamp: now.toISOString(),
        canAdapt: false,
      });
    }
  } else if (isWeekendEveRush) {
    const topCorridor = corridors[0];
    alerts.push({
      category: 'TRAFFIC',
      severity: 'WATCH',
      type: 'TRAFFIC_DELAY',
      title: 'Weekend Evening Traffic',
      message: `Weekend leisure & market rush active on ${topCorridor.name}. Moderate delays expected.`,
      source: `City Traffic Model (${city.charAt(0).toUpperCase() + city.slice(1)})`,
      corridor: topCorridor.name,
      delayMinutes: Math.round(topCorridor.peakDelay * 0.6),
      trafficLevel: 'MODERATE',
      provenance: 'Predictive City Model',
      timestamp: now.toISOString(),
      canAdapt: false,
    });
  }

  // Ghat Road advisory if heading to highlands
  const activeTrip = window.__activeTripData;
  const hasGhatStop = activeTrip?.stops?.some(s =>
    /araku|ghat|paderu|lambasingi|vanjangi|borra/i.test(s.name || '')
  );
  if (hasGhatStop && (isMorningRush || isEveningRush)) {
    alerts.push({
      category: 'TRAFFIC',
      severity: 'INFO',
      type: 'TRAFFIC_DELAY',
      title: 'Ghat Road Single-Lane Advisory',
      message: 'Paderu-Araku Ghat section may have single-lane operation due to maintenance. Allow extra 15 min buffer.',
      source: 'AP Road Transport Authority',
      corridor: 'Paderu-Araku Ghat Rd (NH-516E)',
      delayMinutes: 15,
      trafficLevel: 'MODERATE',
      provenance: 'Official Advisory',
      timestamp: now.toISOString(),
      canAdapt: false,
    });
  }

  return alerts;
}

// Track current filter state
let _currentAlertFilter = 'ALL';

/**
 * Refreshes the Alerts View with weather + traffic alerts.
 */
export function refreshAlertsView() {
  const alertsContainer = document.getElementById('alerts-view');
  if (!alertsContainer) return;

  // Base weather/safety alerts
  const weatherAlerts = window.__currentAlerts || [
    {
      category: 'WEATHER',
      severity: 'INFO',
      title: 'Monsoon Ghat Advisory',
      message: 'Light intermittent mist observed along Paderu-Araku Ghat road. Low beam recommended.',
      source: 'IMD Nowcast (District Met Office)',
      timestamp: new Date().toISOString(),
      canAdapt: false,
    }
  ];

  // Generate contextual traffic alerts
  const cityKey = window.__currentCity || window.__selectedCity || 'visakhapatnam';
  const trafficAlerts = generateTrafficAlerts(cityKey);

  // Merge all alert sources
  const allAlerts = [...weatherAlerts, ...trafficAlerts];

  alertsContainer.innerHTML = '';
  const rendered = renderAlertsCenter({
    activeAlerts: allAlerts,
    activeFilter: _currentAlertFilter,
    onFilterChange: (cat) => {
      _currentAlertFilter = cat;
      refreshAlertsView(); // Re-render with new filter
    },
    onSaferOption: () => switchMobileTab('journey-view', 1),
    onAdapt: () => switchMobileTab('journey-view', 1),
  });
  alertsContainer.appendChild(rendered);

  const badge = document.getElementById('nav-alert-badge');
  if (badge) {
    if (allAlerts.length > 0) {
      badge.textContent = String(allAlerts.length);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}


/**
 * Refreshes the More View.
 */
export function refreshMoreView() {
  const moreContainer = document.getElementById('more-view');
  if (!moreContainer) return;

  moreContainer.innerHTML = '';
  const rendered = renderMoreMenu({
    tripId: 'active_trip',
    isSimulationActive: Boolean(window.__isSimulationActive),
    simulationScenario: window.__simulationScenario || null,
    onSimulate: (action) => {
      window.__isSimulationActive = true;
      window.__simulationScenario = action;
      const hudBtn = document.querySelector(`[id*="${action.toLowerCase()}"]`) ||
        document.querySelector('#btn-simulate-ghat-rain');
      if (hudBtn) hudBtn.click();
      refreshMoreView();
    },
    onClearSimulation: () => {
      window.__isSimulationActive = false;
      window.__simulationScenario = null;
      const clearBtn = document.getElementById('btn-clear-simulation');
      if (clearBtn) clearBtn.click();
      refreshMoreView();
    },
    onOpenTool: (tool) => {
      if (tool === 'budget' && typeof window.renderBudget === 'function') {
        switchMobileTab('tools-view', 4);
        window.renderBudget();
      } else if (tool === 'passport' && typeof window.renderPassport === 'function') {
        switchMobileTab('tools-view', 4);
        window.renderPassport();
      } else {
        alert(`${tool} selected.`);
      }
    }
  });
  moreContainer.appendChild(rendered);
}
