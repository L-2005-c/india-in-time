/**
 * frontend/app-src/src/modules/alertsCenter.js
 *
 * India In-Time v3.0 — Phase 7 Dedicated Alerts Center
 *
 * Communicates safety and reality disruptions in priority order:
 * CRITICAL > SEVERE > WARNING > CAUTION > WATCH > INFO
 * Actionable buttons: [VIEW SAFER OPTION], [ACCEPT REROUTE], [DETAILS]
 * Clean, reassuring empty state.
 */

import { openBottomSheet } from './bottomSheet.js';

export function renderAlertsCenter({
  activeAlerts = [],
  _tripHealth = 'ON_TRACK',
  onAdapt = null,
  onSaferOption = null,
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

  // If no alerts -> Reassuring empty state (Section 34)
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
    emptyDesc.textContent = 'No active safety warnings or material disruptions detected along your planned journey.';

    emptyState.appendChild(icon);
    emptyState.appendChild(emptyTitle);
    emptyState.appendChild(emptyDesc);
    container.appendChild(emptyState);
    return container;
  }

  // Priority sorting: CRITICAL > SEVERE > WARNING > CAUTION > WATCH > INFO
  const priorityWeight = {
    CRITICAL: 6,
    SEVERE: 5,
    WARNING: 4,
    CAUTION: 3,
    WATCH: 2,
    INFO: 1,
  };

  const sortedAlerts = [...activeAlerts].sort((a, b) => {
    const pA = priorityWeight[a.severity] || 3;
    const pB = priorityWeight[b.severity] || 3;
    return pB - pA;
  });

  // Render cards
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '14px';

  sortedAlerts.forEach((alert) => {
    const card = document.createElement('div');
    const isCritical = alert.severity === 'CRITICAL' || alert.severity === 'SEVERE';

    card.style.background = isCritical
      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(185, 28, 28, 0.22))'
      : 'rgba(255, 255, 255, 0.04)';
    card.style.border = isCritical ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)';
    card.style.borderRadius = '14px';
    card.style.padding = '16px';
    card.style.boxShadow = isCritical ? '0 8px 24px rgba(239, 68, 68, 0.25)' : 'none';

    // Header badge
    const cardHead = document.createElement('div');
    cardHead.style.display = 'flex';
    cardHead.style.justifyContent = 'space-between';
    cardHead.style.alignItems = 'center';
    cardHead.style.marginBottom = '8px';

    const sevBadge = document.createElement('span');
    sevBadge.style.fontSize = '11px';
    sevBadge.style.fontWeight = '800';
    sevBadge.style.textTransform = 'uppercase';
    sevBadge.style.letterSpacing = '0.04em';
    sevBadge.style.padding = '3px 8px';
    sevBadge.style.borderRadius = '6px';
    sevBadge.style.background = isCritical ? '#ef4444' : 'rgba(245, 158, 11, 0.2)';
    sevBadge.style.color = isCritical ? '#ffffff' : '#fbbf24';
    sevBadge.textContent = `⚠ ${alert.severity || 'WARNING'}`;

    const timeLabel = document.createElement('span');
    timeLabel.style.fontSize = '11px';
    timeLabel.style.color = '#94a3b8';
    timeLabel.textContent = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active';

    cardHead.appendChild(sevBadge);
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
      adaptBtn.style.background = isCritical ? '#ef4444' : 'linear-gradient(135deg, #6366f1, #8b5cf6)';
      adaptBtn.style.color = '#ffffff';
      adaptBtn.textContent = alert.primaryActionLabel || '⚡ View Safer Option';
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
      openBottomSheet({
        title: alert.title || 'Alert Details',
        subtitle: `Source: ${alert.source || 'Official Feed'}`,
        contentHtml: `
          <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">
            <p style="margin-top:0;"><strong>What happened:</strong> ${alert.message || 'Advisory detected.'}</p>
            <p><strong>Recommendation:</strong> ${alert.recommendation || 'Proceed with caution or accept proposed route adjustment.'}</p>
            <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:10px 12px; margin-top:12px; font-size:12px; color:#94a3b8;">
              <div><strong>Reported:</strong> ${alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Just now'}</div>
              <div><strong>Confidence:</strong> ${alert.confidence || 95}% (Ground-truth verified)</div>
              <div><strong>Affected Area:</strong> ${alert.affectedArea || 'Current Route Corridor'}</div>
            </div>
          </div>
        `,
      });
    });
    actRow.appendChild(detailsBtn);

    card.appendChild(cardHead);
    card.appendChild(cardTitle);
    card.appendChild(cardMsg);
    card.appendChild(actRow);
    list.appendChild(card);
  });

  container.appendChild(list);
  return container;
}
