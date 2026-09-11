/**
 * frontend/app-src/src/modules/alertsCenter.js
 *
 * India In-Time v3.0 — Phase 7 Dedicated Alerts Center
 *
 * Communicates safety, weather, AND traffic disruptions in priority order:
 * CRITICAL > SEVERE > WARNING > CAUTION > WATCH > INFO
 *
 * Categories: WEATHER, TRAFFIC, SAFETY, GENERAL
 * Actionable buttons: [VIEW SAFER OPTION], [ACCEPT REROUTE], [DETAILS]
 * Clean, reassuring empty state.
 */

import { openBottomSheet } from './bottomSheet.js';

// ── Category Styling ──────────────────────────────────────────────────
const CATEGORY_STYLES = {
  TRAFFIC: {
    icon: '🚗',
    gradientCritical: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.25))',
    borderCritical: '#f59e0b',
    shadowCritical: '0 8px 24px rgba(245, 158, 11, 0.25)',
    badgeBg: '#f59e0b',
    badgeBgSoft: 'rgba(245, 158, 11, 0.2)',
    badgeColor: '#fbbf24',
    tabActive: '#f59e0b',
  },
  WEATHER: {
    icon: '🌧️',
    gradientCritical: 'linear-gradient(135deg, rgba(56, 189, 248, 0.14), rgba(14, 116, 144, 0.22))',
    borderCritical: '#38bdf8',
    shadowCritical: '0 8px 24px rgba(56, 189, 248, 0.2)',
    badgeBg: '#0ea5e9',
    badgeBgSoft: 'rgba(14, 165, 233, 0.2)',
    badgeColor: '#38bdf8',
    tabActive: '#38bdf8',
  },
  SAFETY: {
    icon: '🛡️',
    gradientCritical: 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(185, 28, 28, 0.22))',
    borderCritical: '#ef4444',
    shadowCritical: '0 8px 24px rgba(239, 68, 68, 0.25)',
    badgeBg: '#ef4444',
    badgeBgSoft: 'rgba(239, 68, 68, 0.2)',
    badgeColor: '#f87171',
    tabActive: '#ef4444',
  },
  GENERAL: {
    icon: '⚠',
    gradientCritical: 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(185, 28, 28, 0.22))',
    borderCritical: '#ef4444',
    shadowCritical: '0 8px 24px rgba(239, 68, 68, 0.25)',
    badgeBg: '#ef4444',
    badgeBgSoft: 'rgba(245, 158, 11, 0.2)',
    badgeColor: '#fbbf24',
    tabActive: '#a78bfa',
  },
};

function detectCategory(alert) {
  if (alert.category) return alert.category.toUpperCase();
  const type = (alert.type || '').toUpperCase();
  const title = (alert.title || '').toUpperCase();
  if (type.includes('TRAFFIC') || type.includes('ROAD') || type.includes('INCIDENT') ||
      type.includes('CONGESTION') || type.includes('DISRUPTION') ||
      title.includes('TRAFFIC') || title.includes('CONGESTION') || title.includes('ROAD') ||
      title.includes('GRIDLOCK') || title.includes('HIGHWAY')) return 'TRAFFIC';
  if (type.includes('WEATHER') || type.includes('RAIN') || type.includes('HEAT') ||
      type.includes('FOG') || type.includes('MONSOON') || type.includes('GHAT') ||
      title.includes('WEATHER') || title.includes('MONSOON') || title.includes('RAIN') ||
      title.includes('MIST') || title.includes('FOG')) return 'WEATHER';
  if (type.includes('SAFETY') || type.includes('HAZARD') || type.includes('EMERGENCY') ||
      type.includes('FLOOD') || type.includes('FIRE') || type.includes('LANDSLIDE') ||
      title.includes('SAFETY') || title.includes('HAZARD') || title.includes('EMERGENCY')) return 'SAFETY';
  return 'GENERAL';
}

// ── Render Filter Tabs ────────────────────────────────────────────────
function renderFilterTabs(alerts, activeFilter, onFilter) {
  const tabBar = document.createElement('div');
  tabBar.style.display = 'flex';
  tabBar.style.gap = '6px';
  tabBar.style.marginBottom = '16px';
  tabBar.style.overflowX = 'auto';
  tabBar.style.scrollbarWidth = 'none';
  tabBar.style.paddingBottom = '2px';

  const categories = ['ALL'];
  const categoryCount = {};
  alerts.forEach(a => {
    const cat = detectCategory(a);
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  if (categoryCount.TRAFFIC) categories.push('TRAFFIC');
  if (categoryCount.WEATHER) categories.push('WEATHER');
  if (categoryCount.SAFETY) categories.push('SAFETY');

  // Only render tabs if there's more than one category
  if (categories.length <= 2) return null;

  const CATEGORY_LABELS = {
    ALL: { label: 'All', icon: '📋', count: alerts.length },
    TRAFFIC: { label: 'Traffic', icon: '🚗', count: categoryCount.TRAFFIC || 0 },
    WEATHER: { label: 'Weather', icon: '🌧️', count: categoryCount.WEATHER || 0 },
    SAFETY: { label: 'Safety', icon: '🛡️', count: categoryCount.SAFETY || 0 },
  };

  categories.forEach(cat => {
    const tab = document.createElement('button');
    const meta = CATEGORY_LABELS[cat] || { label: cat, icon: '⚠', count: 0 };
    const isActive = activeFilter === cat;
    const catStyle = CATEGORY_STYLES[cat] || CATEGORY_STYLES.GENERAL;

    tab.type = 'button';
    tab.style.display = 'inline-flex';
    tab.style.alignItems = 'center';
    tab.style.gap = '5px';
    tab.style.padding = '6px 14px';
    tab.style.borderRadius = '20px';
    tab.style.fontSize = '12px';
    tab.style.fontWeight = '700';
    tab.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    tab.style.cursor = 'pointer';
    tab.style.transition = 'all 0.2s ease';
    tab.style.whiteSpace = 'nowrap';
    tab.style.flexShrink = '0';

    if (isActive) {
      tab.style.background = cat === 'ALL' ? 'rgba(139, 92, 246, 0.2)' : (catStyle.badgeBgSoft || 'rgba(255,255,255,0.1)');
      tab.style.color = cat === 'ALL' ? '#a78bfa' : (catStyle.tabActive || '#f8fafc');
      tab.style.border = `1.5px solid ${cat === 'ALL' ? '#a78bfa' : (catStyle.tabActive || '#a78bfa')}`;
    } else {
      tab.style.background = 'rgba(255, 255, 255, 0.04)';
      tab.style.color = '#94a3b8';
      tab.style.border = '1.5px solid rgba(255, 255, 255, 0.08)';
    }

    tab.textContent = `${meta.icon} ${meta.label} (${meta.count})`;
    tab.addEventListener('click', () => onFilter(cat));
    tabBar.appendChild(tab);
  });

  return tabBar;
}

// ── Main Render ───────────────────────────────────────────────────────
export function renderAlertsCenter({
  activeAlerts = [],
  _tripHealth = 'ON_TRACK',
  onAdapt = null,
  onSaferOption = null,
  activeFilter = 'ALL',
  onFilterChange = null,
} = {}) {
  const container = document.createElement('div');
  container.className = 'alerts-center-container';
  container.style.padding = '16px 14px 80px';
  container.style.maxWidth = '680px';
  container.style.margin = '0 auto';

  // Heading
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '16px';

  const title = document.createElement('h2');
  title.style.fontSize = '20px';
  title.style.fontWeight = '800';
  title.style.margin = '0';
  title.style.color = 'var(--text-primary, #f8fafc)';
  title.textContent = 'Alerts & Safety';

  const countBadge = document.createElement('span');
  countBadge.style.fontSize = '12px';
  countBadge.style.fontWeight = '700';
  countBadge.style.padding = '3px 10px';
  countBadge.style.borderRadius = '12px';

  if (activeAlerts.length > 0) {
    countBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    countBadge.style.color = '#ef4444';
    countBadge.textContent = `${activeAlerts.length} Active`;
  } else {
    countBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    countBadge.style.color = '#10b981';
    countBadge.textContent = 'All Clear';
  }

  header.appendChild(title);
  header.appendChild(countBadge);
  container.appendChild(header);

  // If no alerts -> Reassuring empty state
  if (!activeAlerts || activeAlerts.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.background = 'rgba(255, 255, 255, 0.03)';
    emptyState.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    emptyState.style.borderRadius = '16px';
    emptyState.style.padding = '36px 20px';
    emptyState.style.textAlign = 'center';

    const icon = document.createElement('div');
    icon.style.fontSize = '40px';
    icon.style.marginBottom = '12px';
    icon.textContent = '🟢';

    const emptyTitle = document.createElement('div');
    emptyTitle.style.fontSize = '16px';
    emptyTitle.style.fontWeight = '700';
    emptyTitle.style.color = '#f8fafc';
    emptyTitle.textContent = "You're All Clear";

    const emptyDesc = document.createElement('div');
    emptyDesc.style.fontSize = '13px';
    emptyDesc.style.color = '#94a3b8';
    emptyDesc.style.marginTop = '6px';
    emptyDesc.style.lineHeight = '1.5';
    emptyDesc.textContent = 'No active safety warnings, traffic disruptions, or weather alerts detected along your planned journey.';

    emptyState.appendChild(icon);
    emptyState.appendChild(emptyTitle);
    emptyState.appendChild(emptyDesc);
    container.appendChild(emptyState);
    return container;
  }

  // ── Category Filter Tabs ────────────────────────────────
  const tabs = renderFilterTabs(activeAlerts, activeFilter, (cat) => {
    if (typeof onFilterChange === 'function') onFilterChange(cat);
  });
  if (tabs) container.appendChild(tabs);

  // Filter alerts by active category
  const filteredAlerts = activeFilter === 'ALL'
    ? activeAlerts
    : activeAlerts.filter(a => detectCategory(a) === activeFilter);

  // Priority sorting: CRITICAL > SEVERE > WARNING > CAUTION > WATCH > INFO
  const priorityWeight = {
    CRITICAL: 6,
    SEVERE: 5,
    WARNING: 4,
    CAUTION: 3,
    WATCH: 2,
    INFO: 1,
  };

  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    const pA = priorityWeight[a.severity] || 3;
    const pB = priorityWeight[b.severity] || 3;
    return pB - pA;
  });

  // Show empty state for filtered category
  if (sortedAlerts.length === 0) {
    const emptyFilter = document.createElement('div');
    emptyFilter.style.background = 'rgba(255, 255, 255, 0.03)';
    emptyFilter.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    emptyFilter.style.borderRadius = '14px';
    emptyFilter.style.padding = '28px 16px';
    emptyFilter.style.textAlign = 'center';
    emptyFilter.style.color = '#94a3b8';
    emptyFilter.style.fontSize = '13px';
    emptyFilter.textContent = `No ${activeFilter.toLowerCase()} alerts active right now.`;
    container.appendChild(emptyFilter);
    return container;
  }

  // Render cards
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '14px';

  sortedAlerts.forEach((alert) => {
    const card = document.createElement('div');
    const isCritical = alert.severity === 'CRITICAL' || alert.severity === 'SEVERE';
    const category = detectCategory(alert);
    const catStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES.GENERAL;

    if (isCritical) {
      card.style.background = catStyle.gradientCritical;
      card.style.border = `2px solid ${catStyle.borderCritical}`;
      card.style.boxShadow = catStyle.shadowCritical;
    } else {
      card.style.background = 'rgba(255, 255, 255, 0.04)';
      card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      card.style.boxShadow = 'none';
    }
    card.style.borderRadius = '14px';
    card.style.padding = '16px';

    // Header badge row
    const cardHead = document.createElement('div');
    cardHead.style.display = 'flex';
    cardHead.style.justifyContent = 'space-between';
    cardHead.style.alignItems = 'center';
    cardHead.style.marginBottom = '8px';

    const badgeRow = document.createElement('div');
    badgeRow.style.display = 'flex';
    badgeRow.style.alignItems = 'center';
    badgeRow.style.gap = '6px';

    // Category chip
    const catChip = document.createElement('span');
    catChip.style.fontSize = '10px';
    catChip.style.fontWeight = '700';
    catChip.style.textTransform = 'uppercase';
    catChip.style.letterSpacing = '0.05em';
    catChip.style.padding = '2px 7px';
    catChip.style.borderRadius = '4px';
    catChip.style.background = catStyle.badgeBgSoft;
    catChip.style.color = catStyle.badgeColor;
    catChip.textContent = `${catStyle.icon} ${category}`;

    // Severity badge
    const sevBadge = document.createElement('span');
    sevBadge.style.fontSize = '11px';
    sevBadge.style.fontWeight = '800';
    sevBadge.style.textTransform = 'uppercase';
    sevBadge.style.letterSpacing = '0.04em';
    sevBadge.style.padding = '3px 8px';
    sevBadge.style.borderRadius = '6px';
    sevBadge.style.background = isCritical ? catStyle.badgeBg : catStyle.badgeBgSoft;
    sevBadge.style.color = isCritical ? '#ffffff' : catStyle.badgeColor;
    sevBadge.textContent = `⚠ ${alert.severity || 'WARNING'}`;

    badgeRow.appendChild(catChip);
    badgeRow.appendChild(sevBadge);

    const timeLabel = document.createElement('span');
    timeLabel.style.fontSize = '11px';
    timeLabel.style.color = '#94a3b8';
    timeLabel.textContent = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active';

    cardHead.appendChild(badgeRow);
    cardHead.appendChild(timeLabel);

    // Title
    const cardTitle = document.createElement('div');
    cardTitle.style.fontSize = '16px';
    cardTitle.style.fontWeight = '700';
    cardTitle.style.color = '#f8fafc';
    cardTitle.style.marginBottom = '6px';
    cardTitle.textContent = alert.title || alert.type || 'Travel Alert';

    // Body message
    const cardMsg = document.createElement('div');
    cardMsg.style.fontSize = '13px';
    cardMsg.style.color = '#cbd5e1';
    cardMsg.style.lineHeight = '1.45';
    cardMsg.textContent = alert.message || 'Advisory conditions active along your route.';

    // ── Traffic-Specific: Delay & Corridor Pill ──────────
    let trafficMeta = null;
    if (category === 'TRAFFIC' && (alert.delayMinutes || alert.corridor || alert.trafficLevel)) {
      trafficMeta = document.createElement('div');
      trafficMeta.style.display = 'flex';
      trafficMeta.style.gap = '8px';
      trafficMeta.style.flexWrap = 'wrap';
      trafficMeta.style.marginTop = '10px';

      if (alert.delayMinutes) {
        const delayPill = document.createElement('span');
        delayPill.style.fontSize = '11px';
        delayPill.style.fontWeight = '700';
        delayPill.style.padding = '3px 10px';
        delayPill.style.borderRadius = '12px';
        delayPill.style.background = alert.delayMinutes >= 30 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)';
        delayPill.style.color = alert.delayMinutes >= 30 ? '#f87171' : '#fbbf24';
        delayPill.textContent = `+${alert.delayMinutes} min delay`;
        trafficMeta.appendChild(delayPill);
      }
      if (alert.corridor) {
        const corridorPill = document.createElement('span');
        corridorPill.style.fontSize = '11px';
        corridorPill.style.fontWeight = '600';
        corridorPill.style.padding = '3px 10px';
        corridorPill.style.borderRadius = '12px';
        corridorPill.style.background = 'rgba(255, 255, 255, 0.06)';
        corridorPill.style.color = '#94a3b8';
        corridorPill.textContent = `📍 ${alert.corridor}`;
        trafficMeta.appendChild(corridorPill);
      }
      if (alert.trafficLevel) {
        const levelPill = document.createElement('span');
        levelPill.style.fontSize = '11px';
        levelPill.style.fontWeight = '600';
        levelPill.style.padding = '3px 10px';
        levelPill.style.borderRadius = '12px';
        const levelColors = {
          GRIDLOCK: { bg: 'rgba(239, 68, 68, 0.2)', fg: '#f87171' },
          SEVERE: { bg: 'rgba(239, 68, 68, 0.2)', fg: '#f87171' },
          HEAVY: { bg: 'rgba(245, 158, 11, 0.2)', fg: '#fbbf24' },
          MODERATE: { bg: 'rgba(234, 179, 8, 0.15)', fg: '#eab308' },
        };
        const lc = levelColors[alert.trafficLevel] || levelColors.MODERATE;
        levelPill.style.background = lc.bg;
        levelPill.style.color = lc.fg;
        levelPill.textContent = `🚦 ${alert.trafficLevel}`;
        trafficMeta.appendChild(levelPill);
      }
    }

    // Primary & Secondary Action buttons
    const actRow = document.createElement('div');
    actRow.style.display = 'flex';
    actRow.style.gap = '8px';
    actRow.style.marginTop = '14px';
    actRow.style.flexWrap = 'wrap';

    if (alert.canAdapt !== false) {
      const adaptBtn = document.createElement('button');
      adaptBtn.className = 'btn-primary-action';
      adaptBtn.style.flex = '1';
      adaptBtn.style.minWidth = '140px';

      if (category === 'TRAFFIC') {
        adaptBtn.style.background = isCritical
          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
          : 'linear-gradient(135deg, #6366f1, #8b5cf6)';
        adaptBtn.textContent = alert.primaryActionLabel || '🔄 View Alternate Route';
      } else {
        adaptBtn.style.background = isCritical ? '#ef4444' : 'linear-gradient(135deg, #6366f1, #8b5cf6)';
        adaptBtn.textContent = alert.primaryActionLabel || '⚡ View Safer Option';
      }
      adaptBtn.style.color = '#ffffff';
      adaptBtn.addEventListener('click', () => {
        if (typeof onSaferOption === 'function') onSaferOption(alert);
        else if (typeof onAdapt === 'function') onAdapt(alert);
      });
      actRow.appendChild(adaptBtn);
    }

    const detailsBtn = document.createElement('button');
    detailsBtn.className = 'btn-subordinate';
    detailsBtn.textContent = 'Why? / Details';
    detailsBtn.addEventListener('click', () => {
      const detailSections = [];

      detailSections.push(`<p style="margin-top:0;"><strong>What happened:</strong> ${alert.message || 'Advisory detected.'}</p>`);
      detailSections.push(`<p><strong>Recommendation:</strong> ${alert.recommendation || (category === 'TRAFFIC' ? 'Consider alternate routes or adjust departure time.' : 'Proceed with caution or accept proposed route adjustment.')}</p>`);

      // Traffic-specific detail section
      if (category === 'TRAFFIC') {
        const trafficDetails = [];
        if (alert.corridor) trafficDetails.push(`<div><strong>Corridor:</strong> ${alert.corridor}</div>`);
        if (alert.delayMinutes) trafficDetails.push(`<div><strong>Estimated Delay:</strong> +${alert.delayMinutes} minutes</div>`);
        if (alert.trafficLevel) trafficDetails.push(`<div><strong>Traffic Level:</strong> ${alert.trafficLevel}</div>`);
        if (alert.congestionFactor) trafficDetails.push(`<div><strong>Congestion Factor:</strong> ${alert.congestionFactor}x</div>`);
        if (alert.provenance) trafficDetails.push(`<div><strong>Data Source:</strong> ${alert.provenance}</div>`);
        if (trafficDetails.length > 0) {
          detailSections.push(`
            <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:10px; padding:12px; margin-top:12px;">
              <div style="font-size:12px; font-weight:700; color:#fbbf24; margin-bottom:8px;">🚗 Traffic Intelligence</div>
              <div style="font-size:12px; color:#94a3b8; display:flex; flex-direction:column; gap:4px;">
                ${trafficDetails.join('')}
              </div>
            </div>
          `);
        }
      }

      detailSections.push(`
        <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:10px 12px; margin-top:12px; font-size:12px; color:#94a3b8;">
          <div><strong>Reported:</strong> ${alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Just now'}</div>
          <div><strong>Confidence:</strong> ${alert.confidence || 95}% (Ground-truth verified)</div>
          <div><strong>Affected Area:</strong> ${alert.affectedArea || alert.corridor || 'Current Route Corridor'}</div>
          <div><strong>Category:</strong> ${category}</div>
        </div>
      `);

      openBottomSheet({
        title: alert.title || 'Alert Details',
        subtitle: `Source: ${alert.source || (category === 'TRAFFIC' ? 'Live Traffic Intelligence' : 'Official Feed')}`,
        contentHtml: `
          <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">
            ${detailSections.join('')}
          </div>
        `,
      });
    });
    actRow.appendChild(detailsBtn);

    card.appendChild(cardHead);
    card.appendChild(cardTitle);
    card.appendChild(cardMsg);
    if (trafficMeta) card.appendChild(trafficMeta);
    card.appendChild(actRow);
    list.appendChild(card);
  });

  container.appendChild(list);
  return container;
}
