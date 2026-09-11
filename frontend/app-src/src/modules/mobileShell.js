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
 * Refreshes the Alerts View.
 */
export function refreshAlertsView() {
  const alertsContainer = document.getElementById('alerts-view');
  if (!alertsContainer) return;

  const mockAlerts = window.__currentAlerts || [
    {
      severity: 'INFO',
      title: 'Monsoon Ghat Advisory',
      message: 'Light intermittent mist observed along Paderu-Araku Ghat road. Low beam recommended.',
      source: 'IMD Nowcast (District Met Office)',
      timestamp: new Date().toISOString(),
      canAdapt: false,
    }
  ];

  alertsContainer.innerHTML = '';
  const rendered = renderAlertsCenter({
    activeAlerts: mockAlerts,
    onSaferOption: () => switchMobileTab('journey-view', 1),
    onAdapt: () => switchMobileTab('journey-view', 1),
  });
  alertsContainer.appendChild(rendered);

  const badge = document.getElementById('nav-alert-badge');
  if (badge) {
    if (mockAlerts.length > 0) {
      badge.textContent = String(mockAlerts.length);
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
