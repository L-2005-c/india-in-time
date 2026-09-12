/**
 * frontend/app-src/src/modules/chatAssistant.js
 *
 * India In-Time v3.0 — Phase 8A AI Assistant Traveler Companion
 *
 * Provides context-aware conversational guidance:
 * 1. Pre-trip Empty State: "Where should we go?", prompt chips (Plan, Explore, Best Time, Gems)
 * 2. Active Journey State: Corridor context, route changes, Why This Plan?, Alternatives
 * 3. Progressive Disclosure: Level 1 (Answer), Level 2 (Why this?), Level 3 (Evidence)
 * 4. Actionable Response Buttons: [VIEW PLAN], [SEE ROUTE], [ADAPT PLAN], [VIEW ALERT]
 *
 * Non-negotiable: The Assistant is NOT a source of truth for safety or closures.
 * It explains machine decisions and provides traveler navigation shortcuts.
 */

export function refreshChatAssistantView() {
  const chatView = document.getElementById('chat-view');
  if (!chatView) return;

  const chatIn = document.getElementById('chat-in');
  if (chatIn) {
    chatIn.placeholder = 'Ask India In-Time…';
  }

  const chipsContainer = document.getElementById('copilot-prompt-chips');
  if (!chipsContainer) return;

  const activeTrip = window.__activeTripData;
  const itin = window.itin || [];
  const hasActiveTrip = Boolean(activeTrip?.stops?.length || itin.length > 0);
  const cityName = window.currentCityName || window.__selectedCity || 'Visakhapatnam';

  chipsContainer.innerHTML = '';

  if (hasActiveTrip) {
    // ── Active Journey State ────────────────────────────────────────────────
    const nextStop = activeTrip?.stops?.[0]?.name || itin[0]?.name || 'Next stop';
    const activeChips = [
      { label: '❓ What changed?', prompt: 'Are there any traffic, weather, or timing updates on my route?' },
      { label: '🤔 Why this plan?', prompt: `Why was ${nextStop} chosen as the priority stop?` },
      { label: '🧭 What should I do?', prompt: 'What is the recommended next action for my current leg?' },
      { label: '🔄 Show alternatives', prompt: `Show me safer or scenic alternatives near ${nextStop}` },
    ];

    activeChips.forEach((c) => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'copilot-chip';
      chipBtn.setAttribute('data-action', 'sendCopilotPrompt');
      chipBtn.setAttribute('data-prompt', c.prompt);
      chipBtn.textContent = c.label;
      chipBtn.addEventListener('click', () => sendAssistantPrompt(c.prompt));
      chipsContainer.appendChild(chipBtn);
    });
  } else {
    // ── Pre-Trip Empty State (Section 6) ────────────────────────────────────
    const preTripChips = [
      { label: '🚀 Plan a trip', action: 'plan' },
      { label: '📍 Explore nearby', prompt: `What are the top must-visit places in ${cityName} right now?` },
      { label: '⏱️ Best time to visit', prompt: `When is the best time of day to visit ${cityName}?` },
      { label: '📋 Build a day plan', prompt: `Suggest an optimal 1-day itinerary for ${cityName}` },
      { label: '✨ Find experiences', prompt: `What are unique local experiences and hidden gems in ${cityName}?` },
      { label: '💡 Help me choose', prompt: `Help me choose between beaches, viewpoints, and temples in ${cityName}` },
    ];

    preTripChips.forEach((c) => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'copilot-chip';
      chipBtn.textContent = c.label;
      if (c.action === 'plan') {
        chipBtn.addEventListener('click', () => {
          if (typeof window.switchMobileTab === 'function') {
            window.switchMobileTab('plan-view', 2);
          } else if (typeof window.switchToView === 'function') {
            window.switchToView('plan-view', 2);
          }
        });
      } else {
        chipBtn.setAttribute('data-action', 'sendCopilotPrompt');
        chipBtn.setAttribute('data-prompt', c.prompt);
        chipBtn.addEventListener('click', () => sendAssistantPrompt(c.prompt));
      }
      chipsContainer.appendChild(chipBtn);
    });
  }

  // Ensure initial welcome message is traveler-friendly
  const messagesEl = document.getElementById('chat-messages');
  if (messagesEl && messagesEl.children.length === 1) {
    const firstBubble = messagesEl.querySelector('.bubble');
    if (firstBubble) {
      firstBubble.innerHTML = `
        <strong>India In-Time Assistant</strong><br>
        <em>Where should we go?</em><br>
        Ask me about ideal visiting hours, authentic food, fares, or tap any quick action below to start planning in ${cityName}.
      `;
    }
  }
}

/**
 * Sends a prompt directly into the chat engine.
 */
function sendAssistantPrompt(promptText) {
  const inp = document.getElementById('chat-in');
  if (!inp) return;
  inp.value = promptText;
  if (typeof window.handleChat === 'function') {
    window.handleChat();
  } else {
    const sendBtn = document.querySelector('.chat-input-bar .send-btn');
    if (sendBtn) sendBtn.click();
  }
}

/**
 * Creates an actionable assistant response block with 3-level progressive disclosure.
 */
export function formatActionableAssistantResponse({
  level1Answer = '',
  level2Reasoning = '',
  level3Evidence = null,
  actions = [],
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'assistant-actionable-bubble';
  wrap.style.lineHeight = '1.5';

  // Level 1: Simple traveler answer
  const answerEl = document.createElement('div');
  answerEl.innerHTML = level1Answer;
  wrap.appendChild(answerEl);

  // Level 2: "Why this?"
  if (level2Reasoning) {
    const whyToggle = document.createElement('button');
    whyToggle.type = 'button';
    whyToggle.style.background = 'transparent';
    whyToggle.style.border = 'none';
    whyToggle.style.color = '#a78bfa';
    whyToggle.style.fontSize = '11px';
    whyToggle.style.fontWeight = '700';
    whyToggle.style.cursor = 'pointer';
    whyToggle.style.padding = '4px 0';
    whyToggle.style.marginTop = '4px';
    whyToggle.style.display = 'inline-block';
    whyToggle.textContent = '▸ Why this recommendation?';

    const whyBox = document.createElement('div');
    whyBox.style.display = 'none';
    whyBox.style.marginTop = '4px';
    whyBox.style.padding = '8px 10px';
    whyBox.style.background = 'rgba(139, 92, 246, 0.08)';
    whyBox.style.border = '1px solid rgba(139, 92, 246, 0.2)';
    whyBox.style.borderRadius = '8px';
    whyBox.style.fontSize = '11px';
    whyBox.style.color = '#e2e8f0';
    whyBox.innerHTML = level2Reasoning;

    whyToggle.addEventListener('click', () => {
      const isClosed = whyBox.style.display === 'none';
      whyBox.style.display = isClosed ? 'block' : 'none';
      whyToggle.textContent = isClosed ? '▾ Hide explanation' : '▸ Why this recommendation?';
    });

    wrap.appendChild(whyToggle);
    wrap.appendChild(whyBox);
  }

  // Level 3: Evidence & Provenance
  if (level3Evidence) {
    const evBox = document.createElement('div');
    evBox.style.fontSize = '10px';
    evBox.style.color = '#94a3b8';
    evBox.style.marginTop = '6px';
    evBox.style.paddingTop = '6px';
    evBox.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
    evBox.innerHTML = `
      <span>Source: ${level3Evidence.source || 'India In-Time Decision Engine'}</span> • 
      <span>Confidence: ${level3Evidence.confidence || '98%'}</span> • 
      <span>Updated: ${level3Evidence.timestamp ? new Date(level3Evidence.timestamp).toLocaleTimeString() : 'Just now'}</span>
    `;
    wrap.appendChild(evBox);
  }

  // Action Buttons
  if (Array.isArray(actions) && actions.length > 0) {
    const actRow = document.createElement('div');
    actRow.style.display = 'flex';
    actRow.style.gap = '6px';
    actRow.style.flexWrap = 'wrap';
    actRow.style.marginTop = '8px';

    actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.background = 'rgba(255, 255, 255, 0.06)';
      btn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      btn.style.borderRadius = '6px';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = '700';
      btn.style.color = '#f8fafc';
      btn.style.cursor = 'pointer';
      btn.textContent = act.label;
      btn.addEventListener('click', () => {
        if (typeof act.onClick === 'function') act.onClick();
      });
      actRow.appendChild(btn);
    });
    wrap.appendChild(actRow);
  }

  return wrap;
}

/**
 * Validates whether a user prompt attempts to override or bypass authoritative safety.
 * Returns an explanatory safety notice if an override is attempted, or null otherwise.
 */
export function checkSafetyOverride(promptText) {
  const q = String(promptText || '').toLowerCase();
  if (/\b(ignore|bypass|override)\b.*\b(closure|road closure|safety|flood|landslide|warning|danger)\b|\btell me it'?s safe anyway\b|\bassume the (flood|landslide|fire) is not real\b|\bignore safety\b/.test(q)) {
    return '🛡️ <strong>Authoritative Safety Rule:</strong> India In-Time cannot override or bypass verified road closures, flood warnings, or safety alerts. Official safety constraints remain strictly enforced. Please follow the recommended safe alternative.';
  }
  return null;
}
