/**
 * frontend/app-src/src/modules/moreMenu.js
 *
 * India In-Time v3.0 — Phase 7 More Menu
 *
 * Houses secondary tools without cluttering the primary journey screen:
 * 1. Developer / Demo Mode (Simulation triggers with strict isolation)
 * 2. Data & Sources (Official provider health telemetry: NDMA, IMD, CWC, FSI)
 * 3. Travel Utilities (Budget Splitter, Passport, Offline Travel Pass, Settings)
 *
 * Preserves all simulation IDs for zero-regression automated test compatibility.
 */

export function renderMoreMenu({
  tripId = 'active_trip',
  isSimulationActive = false,
  simulationScenario = null,
  providerHealth = [],
  onSimulate = null,
  onClearSimulation = null,
  onOpenTool = null,
} = {}) {
  const container = document.createElement('div');
  container.className = 'more-menu-container';
  container.style.padding = '16px 14px 80px';
  container.style.maxWidth = '680px';
  container.style.margin = '0 auto';

  // Header
  const title = document.createElement('h2');
  title.style.fontSize = '20px';
  title.style.fontWeight = '800';
  title.style.margin = '0 0 16px';
  title.style.color = 'var(--text-primary, #f8fafc)';
  title.textContent = 'More & Utilities';
  container.appendChild(title);

  // ── 1. Developer / Demo Mode Section (Section 32) ─────────────────────────
  const devCard = document.createElement('div');
  devCard.className = 'dev-simulation-card';
  devCard.style.background = 'rgba(234, 88, 12, 0.08)';
  devCard.style.border = '1px solid rgba(234, 88, 12, 0.3)';
  devCard.style.borderRadius = '14px';
  devCard.style.padding = '16px';
  devCard.style.marginBottom = '16px';

  const devHead = document.createElement('div');
  devHead.style.display = 'flex';
  devHead.style.justifyContent = 'space-between';
  devHead.style.alignItems = 'center';
  devHead.style.marginBottom = '10px';

  const devTitle = document.createElement('div');
  devTitle.style.fontSize = '14px';
  devTitle.style.fontWeight = '800';
  devTitle.style.color = '#fdba74';
  devTitle.style.display = 'flex';
  devTitle.style.alignItems = 'center';
  devTitle.style.gap = '6px';
  devTitle.innerHTML = '<span>🧪</span> Developer / Demo Mode';

  const devTag = document.createElement('span');
  devTag.style.fontSize = '10px';
  devTag.style.fontWeight = '700';
  devTag.style.background = 'rgba(234, 88, 12, 0.2)';
  devTag.style.color = '#fdba74';
  devTag.style.padding = '2px 8px';
  devTag.style.borderRadius = '4px';
  devTag.textContent = 'ISOLATED DEMO';

  devHead.appendChild(devTitle);
  devHead.appendChild(devTag);
  devCard.appendChild(devHead);

  const devDesc = document.createElement('p');
  devDesc.style.fontSize = '12px';
  devDesc.style.color = '#fed7aa';
  devDesc.style.margin = '0 0 12px';
  devDesc.style.lineHeight = '1.45';
  devDesc.textContent = 'Inject synthetic reality disruptions to demonstrate adaptive replanning, safety guardrails, trust detection, and transport deadlines.';
  devCard.appendChild(devDesc);

  // Active simulation banner if active
  if (isSimulationActive) {
    const activeBanner = document.createElement('div');
    activeBanner.id = 'simulation-active-banner';
    activeBanner.className = 'simulation-active-banner';
    activeBanner.style.background = 'rgba(234, 88, 12, 0.2)';
    activeBanner.style.border = '1px solid #ea580c';
    activeBanner.style.borderRadius = '8px';
    activeBanner.style.padding = '8px 12px';
    activeBanner.style.marginBottom = '12px';
    activeBanner.style.display = 'flex';
    activeBanner.style.justifyContent = 'space-between';
    activeBanner.style.alignItems = 'center';

    const info = document.createElement('div');
    info.style.fontSize = '12px';
    info.style.fontWeight = '700';
    info.style.color = '#fff';
    info.textContent = `SIMULATION ACTIVE: ${simulationScenario || 'Synthetic Disruption'}`;

    const clearBtn = document.createElement('button');
    clearBtn.id = 'btn-clear-simulation';
    clearBtn.setAttribute('data-trip-id', tripId);
    clearBtn.style.background = '#ea580c';
    clearBtn.style.color = '#fff';
    clearBtn.style.border = 'none';
    clearBtn.style.borderRadius = '6px';
    clearBtn.style.padding = '5px 10px';
    clearBtn.style.fontSize = '11px';
    clearBtn.style.fontWeight = '700';
    clearBtn.style.cursor = 'pointer';
    clearBtn.textContent = '✕ Clear Simulation';
    clearBtn.addEventListener('click', () => {
      if (typeof onClearSimulation === 'function') onClearSimulation();
    });

    activeBanner.appendChild(info);
    activeBanner.appendChild(clearBtn);
    devCard.appendChild(activeBanner);
  }

  // Simulation buttons grid
  const simGrid = document.createElement('div');
  simGrid.style.display = 'grid';
  simGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
  simGrid.style.gap = '8px';

  const scenarios = [
    { id: 'btn-simulate-cricket-traffic', label: '🏏 Match Traffic', action: 'CRICKET_TRAFFIC' },
    { id: 'btn-simulate-ghat-rain', label: '🌧️ Ghat Downpour', action: 'GHAT_RAIN' },
    { id: 'btn-simulate-official-closure', label: '⛔ Road Closure', action: 'ROAD_CLOSURE' },
    { id: 'btn-simulate-safety-unavailable', label: 'ℹ️ Data Unavailable', action: 'DATA_UNAVAILABLE' },
    { id: 'btn-simulate-trust-price-mismatch', label: '💰 Price Surge', action: 'PRICE_MISMATCH' },
    { id: 'btn-simulate-trust-route-conflict', label: '⚡ Route Conflict', action: 'ROUTE_CONFLICT' },
    { id: 'btn-simulate-next-deadline', label: '🚆 Train Deadline', action: 'DEADLINE_RISK' },
    { id: 'btn-simulate-next-disruption', label: '⚡ Leg Disruption', action: 'NEXT_LEG_DISRUPTION' },
    { id: 'btn-simulate-next-reset', label: '↺ Reset Next Leg', action: 'RESET_NEXT_LEG' },
  ];

  scenarios.forEach((s) => {
    const btn = document.createElement('button');
    btn.id = s.id;
    btn.setAttribute('data-trip-id', tripId);
    btn.className = 'btn-subordinate';
    btn.style.width = '100%';
    btn.style.justifyContent = 'center';
    btn.style.fontSize = '11px';
    btn.style.fontWeight = '700';
    btn.style.padding = '8px 6px';
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      if (typeof onSimulate === 'function') onSimulate(s.action);
    });
    simGrid.appendChild(btn);
  });

  devCard.appendChild(simGrid);
  container.appendChild(devCard);

  // ── 2. Data & Sources / Provider Telemetry (Section 31) ────────────────────
  const sourcesCard = document.createElement('div');
  sourcesCard.style.background = 'rgba(255, 255, 255, 0.03)';
  sourcesCard.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  sourcesCard.style.borderRadius = '14px';
  sourcesCard.style.padding = '16px';
  sourcesCard.style.marginBottom = '16px';

  const sourcesHead = document.createElement('div');
  sourcesHead.style.fontSize = '14px';
  sourcesHead.style.fontWeight = '800';
  sourcesHead.style.color = '#f8fafc';
  sourcesHead.style.marginBottom = '10px';
  sourcesHead.innerHTML = '<span>🏛️</span> Data Sources & Official Feeds';
  sourcesCard.appendChild(sourcesHead);

  const defaultProviders = [
    { provider: 'NDMA', name: 'NDMA SACHET', status: 'LIVE', coverage: 'National Disaster Directives' },
    { provider: 'IMD', name: 'IMD Mausam', status: 'LIVE', coverage: 'Color Warnings (750+ Districts)' },
    { provider: 'CWC', name: 'CWC Flood Service', status: 'LIVE', coverage: 'Daily Flood Bulletins' },
    { provider: 'FSI', name: 'FSI Forest Fire', status: 'LIVE', coverage: 'Thermal Anomalies (FIRMS)' },
  ];

  const providers = (Array.isArray(providerHealth) && providerHealth.length > 0) ? providerHealth : defaultProviders;

  const provList = document.createElement('div');
  provList.style.display = 'grid';
  provList.style.gridTemplateColumns = '1fr 1fr';
  provList.style.gap = '8px';

  providers.forEach((p) => {
    const pItem = document.createElement('div');
    pItem.style.background = 'rgba(255, 255, 255, 0.02)';
    pItem.style.border = '1px solid rgba(255, 255, 255, 0.06)';
    pItem.style.borderRadius = '8px';
    pItem.style.padding = '8px 10px';

    const pRow = document.createElement('div');
    pRow.style.display = 'flex';
    pRow.style.justifyContent = 'space-between';
    pRow.style.alignItems = 'center';

    const pName = document.createElement('strong');
    pName.style.fontSize = '12px';
    pName.style.color = '#f8fafc';
    pName.textContent = p.name || p.provider;

    const pStatus = document.createElement('span');
    pStatus.style.fontSize = '9px';
    pStatus.style.fontWeight = '800';
    pStatus.style.padding = '1px 5px';
    pStatus.style.borderRadius = '4px';
    pStatus.style.background = 'rgba(16, 185, 129, 0.15)';
    pStatus.style.color = '#10b981';
    pStatus.textContent = p.status || 'LIVE';

    pRow.appendChild(pName);
    pRow.appendChild(pStatus);

    const pCov = document.createElement('div');
    pCov.style.fontSize = '10px';
    pCov.style.color = '#94a3b8';
    pCov.style.marginTop = '4px';
    pCov.textContent = p.dataCoverage || p.coverage || 'Official feed';

    pItem.appendChild(pRow);
    pItem.appendChild(pCov);
    provList.appendChild(pItem);
  });

  sourcesCard.appendChild(provList);
  container.appendChild(sourcesCard);

  // ── 3. Travel Utilities Grid ──────────────────────────────────────────────
  const utilsCard = document.createElement('div');
  utilsCard.style.background = 'rgba(255, 255, 255, 0.03)';
  utilsCard.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  utilsCard.style.borderRadius = '14px';
  utilsCard.style.padding = '16px';

  const utilsHead = document.createElement('div');
  utilsHead.style.fontSize = '14px';
  utilsHead.style.fontWeight = '800';
  utilsHead.style.color = '#f8fafc';
  utilsHead.style.marginBottom = '12px';
  utilsHead.innerHTML = '<span>🧰</span> Travel Utilities';
  utilsCard.appendChild(utilsHead);

  const tools = [
    { name: 'Alerts Center', icon: '⚠️', desc: 'Weather, traffic, and safety alerts', action: 'alerts' },
    { name: 'Budget Splitter', icon: '💸', desc: 'Manage shared group expenses', action: 'budget' },
    { name: 'Travel Passport', icon: '🛂', desc: 'View collected cultural stamps', action: 'passport' },
    { name: 'Offline Pass', icon: '📱', desc: 'Export offline emergency pass', action: 'offlinePass' },
    { name: 'Preferences & DNA', icon: '🧬', desc: 'Configure traveler personality', action: 'dna' },
  ];

  const toolsGrid = document.createElement('div');
  toolsGrid.style.display = 'grid';
  toolsGrid.style.gridTemplateColumns = '1fr 1fr';
  toolsGrid.style.gap = '10px';

  tools.forEach((t) => {
    const tBtn = document.createElement('button');
    tBtn.style.background = 'rgba(255, 255, 255, 0.04)';
    tBtn.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    tBtn.style.borderRadius = '10px';
    tBtn.style.padding = '12px';
    tBtn.style.textAlign = 'left';
    tBtn.style.cursor = 'pointer';
    tBtn.style.display = 'flex';
    tBtn.style.flexDirection = 'column';
    tBtn.style.gap = '4px';

    const tRow = document.createElement('div');
    tRow.style.display = 'flex';
    tRow.style.alignItems = 'center';
    tRow.style.gap = '6px';

    const tIcon = document.createElement('span');
    tIcon.style.fontSize = '18px';
    tIcon.textContent = t.icon;

    const tTitle = document.createElement('strong');
    tTitle.style.fontSize = '12px';
    tTitle.style.color = '#f8fafc';
    tTitle.textContent = t.name;

    tRow.appendChild(tIcon);
    tRow.appendChild(tTitle);

    const tDesc = document.createElement('span');
    tDesc.style.fontSize = '10px';
    tDesc.style.color = '#94a3b8';
    tDesc.textContent = t.desc;

    tBtn.appendChild(tRow);
    tBtn.appendChild(tDesc);

    tBtn.addEventListener('click', () => {
      if (typeof onOpenTool === 'function') onOpenTool(t.action);
    });

    toolsGrid.appendChild(tBtn);
  });

  utilsCard.appendChild(toolsGrid);
  container.appendChild(utilsCard);

  return container;
}
