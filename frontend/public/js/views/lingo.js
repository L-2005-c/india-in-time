// ══════════════════════════════════════════════════
// Lingo View — replaces renderLingo() with onclick= → data-action
// ══════════════════════════════════════════════════
import { registerActions } from '../core/events.js';

const PHRASES = [
  { en: 'How much is this?',     te: 'Bhaiya, kitne ka hai?' },
  { en: 'Where is the washroom?',te: 'Washroom kahan hai?' },
  { en: 'Stop the auto here',    te: 'Yahan rok do' },
  { en: 'No spicy please',       te: 'Mirchi kam daalna' },
  { en: 'Yes / No',              te: 'Haan / Nahi' },
  { en: 'Too expensive!',        te: 'Bahut mehenga hai!' },
];

export function renderLingo(deps) {
  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🗣️ Local Lingo</div></div><div class="lingo-list">${PHRASES.map((p, i) => `<div class="lingo-card"><div><div class="lingo-en">${p.en}</div><div class="lingo-te">${p.te}</div></div><button class="lingo-speak" data-action="speakPhrase" data-text="${p.te}">🔊</button></div>`).join('')}</div>`;
}

export function registerLingoActions(deps) {
  registerActions({
    speakPhrase: (btn) => {
      const text = btn.dataset.text;
      if (text && deps.speak) deps.speak(text);
    },
  });
}
