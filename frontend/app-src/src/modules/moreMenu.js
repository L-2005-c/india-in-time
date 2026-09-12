/**
 * frontend/app-src/src/modules/moreMenu.js
 *
 * India In-Time v3.0 — Phase 8A More & Utilities Screen
 *
 * Provides a traveler-centric secondary hub:
 * 1. Traveler Profile & DNA Quick Bar
 * 2. Dedicated Alerts & Safety Center Banner
 * 3. Expanded Travel Utilities Grid (10 genuine capabilities)
 * 4. Data Sources & Official Provider Health Telemetry (NDMA, IMD, CWC, FSI)
 * 5. Offline Storage & Traveler Settings
 *
 * Non-negotiable: Developer / Demo Mode is REMOVED from More.
 * (Simulation controls reside canonically in the Journey HUD).
 */

export function renderMoreMenu({
  _tripId = 'active_trip',
  providerHealth = [],
  onOpenTool = null,
  activeAlertsCount = 0,
} = {}) {
  const container = document.createElement('div');
  container.className = 'more-menu-container';
  container.style.padding = '16px 14px 80px';
  container.style.maxWidth = '680px';
  container.style.margin = '0 auto';

  // ── 1. Header & Traveler Profile Bar ──────────────────────────────────────
  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.alignItems = 'center';
  titleRow.style.marginBottom = '16px';

  const title = document.createElement('h2');
  title.style.fontSize = '20px';
  title.style.fontWeight = '800';
  title.style.margin = '0';
  title.style.color = 'var(--text-primary, #f8fafc)';
  title.textContent = 'More & Utilities';

  const travelerBadge = document.createElement('div');
  travelerBadge.style.display = 'flex';
  travelerBadge.style.alignItems = 'center';
  travelerBadge.style.gap = '6px';
  travelerBadge.style.fontSize = '11px';
  travelerBadge.style.color = '#a78bfa';
  travelerBadge.style.background = 'rgba(139, 92, 246, 0.12)';
  travelerBadge.style.border = '1px solid rgba(139, 92, 246, 0.25)';
  travelerBadge.style.borderRadius = '16px';
  travelerBadge.style.padding = '3px 10px';
  travelerBadge.innerHTML = '<span>👤</span> <span>Traveler Mode</span>';

  titleRow.appendChild(title);
  titleRow.appendChild(travelerBadge);
  container.appendChild(titleRow);

  // ── 2. Prominent Alerts & Safety Banner ───────────────────────────────────
  const alertsBanner = document.createElement('div');
  alertsBanner.className = 'more-alerts-banner';
  alertsBanner.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.1) 100%)';
  alertsBanner.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  alertsBanner.style.borderRadius = '14px';
  alertsBanner.style.padding = '14px 16px';
  alertsBanner.style.marginBottom = '18px';
  alertsBanner.style.cursor = 'pointer';
  alertsBanner.style.display = 'flex';
  alertsBanner.style.justifyContent = 'space-between';
  alertsBanner.style.alignItems = 'center';
  alertsBanner.style.transition = 'all 0.2s ease';

  const alertLeft = document.createElement('div');
  alertLeft.style.display = 'flex';
  alertLeft.style.alignItems = 'center';
  alertLeft.style.gap = '12px';

  const alertIcon = document.createElement('span');
  alertIcon.style.fontSize = '24px';
  alertIcon.textContent = '⚠️';

  const alertText = document.createElement('div');
  const alertTitle = document.createElement('strong');
  alertTitle.style.fontSize = '14px';
  alertTitle.style.color = '#f8fafc';
  alertTitle.style.display = 'block';
  alertTitle.textContent = 'Alerts & Safety Center';

  const alertDesc = document.createElement('span');
  alertDesc.style.fontSize = '11px';
  alertDesc.style.color = '#fca5a5';
  alertDesc.textContent = 'Live & verified weather, traffic, road closures & safety alerts';

  alertText.appendChild(alertTitle);
  alertText.appendChild(alertDesc);
  alertLeft.appendChild(alertIcon);
  alertLeft.appendChild(alertText);

  const alertRight = document.createElement('div');
  alertRight.style.display = 'flex';
  alertRight.style.alignItems = 'center';
  alertRight.style.gap = '8px';

  const alertCountBadge = document.createElement('span');
  alertCountBadge.id = 'more-alert-count-badge';
  alertCountBadge.style.fontSize = '11px';
  alertCountBadge.style.fontWeight = '800';
  alertCountBadge.style.padding = '2px 8px';
  alertCountBadge.style.borderRadius = '10px';
  alertCountBadge.style.background = '#ef4444';
  alertCountBadge.style.color = '#fff';
  alertCountBadge.textContent = activeAlertsCount > 0 ? `${activeAlertsCount} Active` : 'All Clear';

  const arrow = document.createElement('span');
  arrow.style.color = '#94a3b8';
  arrow.style.fontSize = '16px';
  arrow.textContent = '›';

  alertRight.appendChild(alertCountBadge);
  alertRight.appendChild(arrow);
  alertsBanner.appendChild(alertLeft);
  alertsBanner.appendChild(alertRight);

  alertsBanner.addEventListener('click', () => {
    if (typeof onOpenTool === 'function') onOpenTool('alerts');
  });
  container.appendChild(alertsBanner);

  // ── 3. Expanded Travel Utilities Grid (10 Practical Capabilities) ─────────
  const utilsCard = document.createElement('div');
  utilsCard.style.background = 'rgba(255, 255, 255, 0.03)';
  utilsCard.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  utilsCard.style.borderRadius = '16px';
  utilsCard.style.padding = '16px';
  utilsCard.style.marginBottom = '18px';

  const utilsHead = document.createElement('div');
  utilsHead.style.fontSize = '14px';
  utilsHead.style.fontWeight = '800';
  utilsHead.style.color = '#f8fafc';
  utilsHead.style.marginBottom = '12px';
  utilsHead.innerHTML = '<span>🧰</span> Travel Utilities';
  utilsCard.appendChild(utilsHead);

  const tools = [
    { name: 'Alerts & Safety', icon: '⚠️', desc: 'Verified weather, traffic & safety stream', action: 'alerts', highlight: true },
    { name: 'Budget & Splitter', icon: '💸', desc: 'Manage shared group expenses & limits', action: 'budget' },
    { name: 'Travel Passport', icon: '🛂', desc: 'View collected cultural stamps & badges', action: 'passport' },
    { name: 'Emergency SOS', icon: '🚨', desc: 'National helplines & 1-tap safe havens', action: 'emergencySos' },
    { name: 'Offline Travel Pass', icon: '📱', desc: 'Export itinerary pass for zero-data use', action: 'offlinePass' },
    { name: 'Traveler DNA', icon: '🧬', desc: 'Calibrate pacing, comfort & vibe profile', action: 'dna' },
    { name: 'Smart Weather & AQI', icon: '🌦️', desc: 'District micro-climate & air quality', action: 'weatherRadar' },
    { name: 'Packing Checklist', icon: '🎒', desc: 'Weather-aware gear & document checklist', action: 'packing' },
    { name: 'Local Etiquette & Words', icon: '🗣️', desc: 'Regional customs, rituals & everyday words', action: 'phrases' },
    { name: 'Transit & Train Status', icon: '🚆', desc: 'Corridor buffers & hub departure deadlines', action: 'transitStatus' },
  ];

  const toolsGrid = document.createElement('div');
  toolsGrid.style.display = 'grid';
  toolsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
  toolsGrid.style.gap = '10px';

  tools.forEach((t) => {
    const tBtn = document.createElement('button');
    tBtn.type = 'button';
    tBtn.className = 'more-utility-btn';
    tBtn.style.background = t.highlight ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)';
    tBtn.style.border = t.highlight ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)';
    tBtn.style.borderRadius = '12px';
    tBtn.style.padding = '12px 10px';
    tBtn.style.textAlign = 'left';
    tBtn.style.cursor = 'pointer';
    tBtn.style.display = 'flex';
    tBtn.style.flexDirection = 'column';
    tBtn.style.gap = '4px';
    tBtn.style.transition = 'all 0.15s ease';

    const tRow = document.createElement('div');
    tRow.style.display = 'flex';
    tRow.style.alignItems = 'center';
    tRow.style.gap = '6px';

    const tIcon = document.createElement('span');
    tIcon.style.fontSize = '18px';
    tIcon.textContent = t.icon;

    const tTitle = document.createElement('strong');
    tTitle.style.fontSize = '12px';
    tTitle.style.fontWeight = '700';
    tTitle.style.color = t.highlight ? '#fca5a5' : '#f8fafc';
    tTitle.textContent = t.name;

    tRow.appendChild(tIcon);
    tRow.appendChild(tTitle);

    const tDesc = document.createElement('span');
    tDesc.style.fontSize = '10px';
    tDesc.style.color = '#94a3b8';
    tDesc.style.lineHeight = '1.35';
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

  // ── 4. Data Sources & Official Feeds Telemetry ─────────────────────────────
  const sourcesCard = document.createElement('div');
  sourcesCard.style.background = 'rgba(255, 255, 255, 0.03)';
  sourcesCard.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  sourcesCard.style.borderRadius = '16px';
  sourcesCard.style.padding = '16px';
  sourcesCard.style.marginBottom = '18px';

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
    { provider: 'CWC', name: 'CWC Flood Service', status: 'LIVE', coverage: 'Daily River Bulletins' },
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
    pName.style.fontSize = '11.5px';
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
    pCov.style.fontSize = '9.5px';
    pCov.style.color = '#94a3b8';
    pCov.style.marginTop = '4px';
    pCov.textContent = p.dataCoverage || p.coverage || 'Official feed';

    pItem.appendChild(pRow);
    pItem.appendChild(pCov);
    provList.appendChild(pItem);
  });

  sourcesCard.appendChild(provList);
  container.appendChild(sourcesCard);

  // ── 5. Offline Storage & App Settings ─────────────────────────────────────
  const settingsCard = document.createElement('div');
  settingsCard.style.background = 'rgba(255, 255, 255, 0.02)';
  settingsCard.style.border = '1px solid rgba(255, 255, 255, 0.06)';
  settingsCard.style.borderRadius = '14px';
  settingsCard.style.padding = '14px 16px';

  const settingsHead = document.createElement('div');
  settingsHead.style.fontSize = '13px';
  settingsHead.style.fontWeight = '800';
  settingsHead.style.color = '#f8fafc';
  settingsHead.style.marginBottom = '10px';
  settingsHead.innerHTML = '<span>⚙️</span> Offline & App Settings';
  settingsCard.appendChild(settingsHead);

  const settingsList = document.createElement('div');
  settingsList.style.display = 'flex';
  settingsList.style.flexDirection = 'column';
  settingsList.style.gap = '8px';

  const rows = [
    { label: 'Offline Map Cache', value: 'Active (3.8 MB cached)', action: 'cache' },
    { label: 'Privacy & Terms', value: 'View Policies', action: 'legal' },
  ];

  rows.forEach((r) => {
    const rowEl = document.createElement('div');
    rowEl.style.display = 'flex';
    rowEl.style.justifyContent = 'space-between';
    rowEl.style.alignItems = 'center';
    rowEl.style.fontSize = '12px';
    rowEl.style.color = '#cbd5e1';

    const rLbl = document.createElement('span');
    rLbl.textContent = r.label;

    const rVal = document.createElement('span');
    rVal.style.fontSize = '11px';
    rVal.style.color = '#94a3b8';
    rVal.textContent = r.value;

    rowEl.appendChild(rLbl);
    rowEl.appendChild(rVal);
    settingsList.appendChild(rowEl);
  });

  settingsCard.appendChild(settingsList);
  container.appendChild(settingsCard);

  return container;
}
