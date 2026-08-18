import { sanitizeChatHtml, setText } from '../utils/html-safe.js';
let _toastHideTid = null;
export function showToast(icon, title, msg, duration = 5000) {
  try {
    if (typeof window !== 'undefined' && typeof window.__a11yAnnounce === 'function') {
      window.__a11yAnnounce((title ? title + '. ' : '') + (msg || ''));
    }
  } catch (_) {}
  const iconEl = document.getElementById('notif-icon');
  const titleEl = document.getElementById('notif-title');
  const msgEl = document.getElementById('notif-msg');
  const t = document.getElementById('notif-toast');
  if (!t) return;
  if (iconEl) setText(iconEl, icon);
  if (titleEl) setText(titleEl, title);
  if (msgEl) msgEl.innerHTML = sanitizeChatHtml(msg);
  t.style.display = 'block';
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(_toastHideTid);
  _toastHideTid = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 280);
  }, duration);
}
