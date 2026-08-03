// ══════════════════════════════════════════════════
// Safe DOM helpers — escaping, sanitization, element creation
// ══════════════════════════════════════════════════

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape user-controlled strings before inserting into HTML. */
export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, ch => ESC_MAP[ch]);
}

/** Escape a string for use inside an HTML attribute value (double-quoted). */
export function escapeAttr(str) {
  return escapeHtml(str);
}

/**
 * Sanitize an HTML fragment for safe innerHTML insertion.
 * Uses DOMPurify when loaded, otherwise strips all tags.
 */
export function sanitizeChatHtml(raw) {
  if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'a', 'span', 'div',
        'ul', 'ol', 'li', 'small', 'code', 'pre', 'hr', 'img', 'h1',
        'h2', 'h3', 'h4', 'sub', 'sup', 'mark', 'blockquote', 'table',
        'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd', 'details',
        'summary', 'section', 'input', 'label', 'button', 'select',
        'option', 'optgroup', 'textarea', 'svg', 'path', 'circle',
        'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs',
        'use', 'style',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'style', 'class', 'id', 'src', 'alt', 'width',
        'height', 'rel', 'aria-label', 'title', 'role', 'tabindex',
        'data-action', 'data-name', 'data-idx', 'data-view', 'data-id',
        'data-plan-id', 'data-text', 'data-rating', 'data-tag',
        'data-arg', 'type', 'value', 'placeholder', 'name', 'checked',
        'disabled', 'for', 'maxlength', 'min', 'max', 'step',
        'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
        'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1',
        'x2', 'y2', 'points', 'transform', 'opacity', 'xmlns',
        'aria-hidden', 'onerror',
      ],
    });
  }
  // Fallback: strip all HTML tags (safe but loses formatting)
  return String(raw || '').replace(/<[^>]+>/g, '');
}

/**
 * Format AI-generated text for display — converts markdown-like
 * patterns (bold, bullets, headers) into HTML.
 */
export function formatAiText(text) {
  if (!text) return '';
  return sanitizeChatHtml(
    String(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^- (.+)$/gm, '• $1<br>')
      .replace(/\n/g, '<br>')
  );
}
