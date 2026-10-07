/**
 * frontend/app-src/src/modules/provenanceBadge.js
 *
 * Provenance & Data Trust Visualizer (Phase 1, 6, & 12 Requirement).
 * Provides distinct badges for Traveler Mode (actionable, calm)
 * and Evidence Mode (transparent audit breakdown).
 */

export const PROVENANCE_THEMES = Object.freeze({
  LIVE: {
    bg: '#ecfdf5',
    color: '#065f46',
    border: '#a7f3d0',
    icon: '●',
    label: 'Live Traffic',
  },
  RECENT: {
    bg: '#f0fdf4',
    color: '#166534',
    border: '#bbf7d0',
    icon: '●',
    label: 'Updated recently',
  },
  PREDICTED: {
    bg: '#eff6ff',
    color: '#1e40af',
    border: '#bfdbfe',
    icon: '◐',
    label: 'Corridor Model',
  },
  HISTORICAL: {
    bg: '#fefce8',
    color: '#854d0e',
    border: '#fef08a',
    icon: '○',
    label: 'Typical Traffic',
  },
  ESTIMATED: {
    bg: '#fff7ed',
    color: '#9a3412',
    border: '#ffedd5',
    icon: '△',
    label: 'Estimated Route',
  },
  VERIFIED_POI: {
    bg: '#f0fdf4',
    color: '#15803d',
    border: '#86efac',
    icon: '✓',
    label: 'Verified Entrance',
  },
  CLOSURE_ALERT: {
    bg: '#fef2f2',
    color: '#991b1b',
    border: '#fecaca',
    icon: '⚠',
    label: 'Road Closure',
  },
});

/**
 * Creates HTML string for a provenance badge.
 *
 * @param {Object} options
 * @param {string} options.type - 'LIVE' | 'HISTORICAL' | 'PREDICTED' | 'ESTIMATED' | 'VERIFIED_POI' | 'CLOSURE_ALERT'
 * @param {string} [options.customLabel] - Optional custom label
 * @param {string} [options.ageText] - e.g. "Updated 45s ago"
 * @param {boolean} [options.evidenceMode] - Whether to render full audit evidence
 * @param {Object} [options.evidence] - { provider, confidence, ageSeconds, coordinates }
 * @returns {string} Safe HTML string
 */
export function renderProvenanceBadge(options = {}) {
  const type = options.type || 'LIVE';
  const theme = PROVENANCE_THEMES[type] || PROVENANCE_THEMES.ESTIMATED;
  const label = options.customLabel || theme.label;
  const isEvidence = Boolean(options.evidenceMode);
  const evidence = options.evidence || {};

  const badgeHtml = `
    <span class="provenance-badge provenance-${type.toLowerCase()}" style="
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      background-color: ${theme.bg};
      color: ${theme.color};
      border: 1px solid ${theme.border};
      letter-spacing: 0.02em;
    " title="${isEvidence ? 'Audit Evidence Mode Active' : 'Traveler Mode'}">
      <span style="font-size: 9px;">${theme.icon}</span>
      <span>${escapeHtml(label)}</span>
      ${options.ageText ? `<span style="opacity: 0.75; font-weight: normal; font-size: 10px;">• ${escapeHtml(options.ageText)}</span>` : ''}
    </span>
  `;

  if (!isEvidence || Object.keys(evidence).length === 0) {
    return badgeHtml;
  }

  // Evidence mode details panel
  return `
    <div class="provenance-evidence-container" style="display: inline-block;">
      ${badgeHtml}
      <div class="evidence-details" style="
        margin-top: 4px;
        font-size: 10px;
        color: #4b5563;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 4px 8px;
        line-height: 1.4;
      ">
        ${evidence.provider ? `<div><strong>Source:</strong> ${escapeHtml(evidence.provider)}</div>` : ''}
        ${evidence.confidence !== undefined ? `<div><strong>Confidence:</strong> ${Math.round(evidence.confidence * (evidence.confidence <= 1 ? 100 : 1))}%</div>` : ''}
        ${evidence.coordinates ? `<div><strong>GPS Target:</strong> ${escapeHtml(evidence.coordinates)}</div>` : ''}
        ${evidence.verifiedAt ? `<div><strong>Verified:</strong> ${escapeHtml(evidence.verifiedAt)}</div>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
