import { sanitizeChatHtml } from '../utils/html-safe.js';

export function addMsg(html, isBot = true) {
  const box = document.getElementById('chat-messages');
  if (!box) return null;
  const row = document.createElement('div');
  row.className = 'msg-row' + (isBot ? '' : ' from-user') + ' fade-in';
  const safe = sanitizeChatHtml(html);
  row.innerHTML = isBot
    ? `<div class="msg-avatar av-ai">AI</div><div class="bubble">${safe}</div>`
    : `<div class="bubble user-b">${safe}</div><div class="msg-avatar av-me">ME</div>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  return row;
}
