import { browserLogger } from './browser-logger.js';
const CHAT_ALLOWED_TAGS = ['strong','em','b','i','br','span','u','small','div','button','textarea'];
const CHAT_ALLOWED_ATTR = ['style','class','data-action','data-n','data-cat','data-role','data-place-id','data-place-name','data-arg','data-rating','type','maxlength','rows','placeholder','aria-label','disabled'];
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function sanitizeChatHtml(html) {
  const str = String(html ?? '');
  if (typeof window !== 'undefined' && window.DOMPurify?.sanitize) {
    return window.DOMPurify.sanitize(str, { ALLOWED_TAGS: CHAT_ALLOWED_TAGS, ALLOWED_ATTR: CHAT_ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
  }
  browserLogger.warn('[security] DOMPurify unavailable — plain-text fallback');
  return escapeHtml(str);
}
export function formatAiText(str) {
  return escapeHtml(str).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}
export function setText(el, text) { if (el) el.textContent = text == null ? '' : String(text); }
export function setSafeHtml(el, html) { if (el) el.innerHTML = sanitizeChatHtml(html); }
export { CHAT_ALLOWED_TAGS, CHAT_ALLOWED_ATTR };
