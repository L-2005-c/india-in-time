/**
 * FAANG-Grade AI Copilot 2.0 UI Module
 * Supports rich message bubbles, contextual prompt suggestion chips,
 * and 1-tap actions (Add to Itinerary, View on Map, Check Budget).
 */

import { sanitizeChatHtml } from '../utils/html-safe.js';

export function addMsg(html, isBot = true, actions = null) {
  const box = document.getElementById('chat-messages');
  if (!box) return null;
  const row = document.createElement('div');
  row.className = 'msg-row' + (isBot ? '' : ' from-user') + ' fade-in';
  const safe = sanitizeChatHtml(html);

  let actionsHtml = '';
  if (isBot && Array.isArray(actions) && actions.length > 0) {
    const buttons = actions
      .map(
        (a) => `
      <button class="chat-action-btn" data-action="${a.action || 'chatAction'}" data-arg="${a.arg || ''}">
        ${a.label || 'Action'}
      </button>
    `
      )
      .join('');
    actionsHtml = `<div class="chat-action-row">${buttons}</div>`;
  }

  row.innerHTML = isBot
    ? `<div class="msg-avatar av-ai">✦</div><div class="bubble">${safe}${actionsHtml}</div>`
    : `<div class="bubble user-b">${safe}</div><div class="msg-avatar av-me">ME</div>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  return row;
}

export function renderCopilotPromptChips(city = 'India') {
  const chips = [
    `☕ Best chai & snacks in ${city}`,
    `🌅 When is Golden Hour today?`,
    `🚕 Taxi & auto fare estimates`,
    `🌧️ Monsoon & indoor backup plan`,
    `🏛️ Monument entry & camera rules`,
  ];

  return `
    <div class="copilot-prompt-chips" id="copilot-prompt-chips">
      ${chips
        .map(
          (c) => `
        <button class="copilot-chip" data-action="sendCopilotPrompt" data-prompt="${c}">
          ${c}
        </button>
      `
        )
        .join('')}
    </div>
  `;
}
