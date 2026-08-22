// frontend/app-src/src/modules/feedback.js
// Modularized feedback handling for place ratings and overall app feedback.

export const APP_FEEDBACK_CATS = [
  ['love_it', 'Loving it 😍'],
  ['bug', 'Found a bug 🐛'],
  ['feature_request', 'Missing something 💡'],
  ['confusing', 'Confusing 🤔'],
  ['general', 'Just general 💭'],
];

export function promptStopFeedback(place, { escapeHtml, addMsg }) {
  if (!place?.id || !place?.name) return;
  addMsg(
    `⭐ How was <strong>${escapeHtml(place.name)}</strong>?<br><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" data-role="place-fb" data-place-id="${escapeHtml(String(place.id))}" data-place-name="${escapeHtml(place.name)}">` +
      [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<button type="button" data-action="rateStopClick" data-n="${n}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:7px 11px;font-size:14px;cursor:pointer">${'⭐'.repeat(n)}</button>`
        )
        .join('') +
      `</div>`
  );
}

export async function rateStop(placeId, placeName, rating, row, { escapeHtml, API, currentCityName, showToast, browserLogger }) {
  const targetRow = row || document.querySelector(`[data-role="place-fb"][data-place-id="${CSS.escape(String(placeId))}"]`);
  if (targetRow) {
    targetRow.outerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Thanks for rating ${escapeHtml(placeName)} — ${'⭐'.repeat(rating)}</div>`;
  }
  try {
    await API.submitPlaceFeedback(placeName, currentCityName, rating);
    showToast('⭐', 'Thanks for rating it!', 'Real feedback like this shapes future recommendations.', 3000);
  } catch (e) {
    if (browserLogger) browserLogger.error('rateStop error', e);
  }
}

export function showAppFeedback({ switchToView, registerChatActions, addMsg }) {
  switchToView('chat-view', 2);
  if (typeof registerChatActions === 'function') registerChatActions();
  addMsg(
    `💬 <strong>How's India In-Time working for you?</strong><br>Your honest take — good or bad — genuinely shapes what we build next.` +
      `<div class="fb-card" data-role="fb-card" data-rating="0" data-cat="" style="margin-top:10px">` +
      `<div data-role="fb-stars" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">` +
      [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<button type="button" data-action="fbSetStar" data-n="${n}" aria-label="Rate ${n} star${n > 1 ? 's' : ''}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:8px 12px;font-size:16px;cursor:pointer;line-height:1;pointer-events:auto">☆</button>`
        )
        .join('') +
      `</div>` +
      `<div data-role="fb-tags" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">` +
      APP_FEEDBACK_CATS.map(
        ([v, l]) =>
          `<button type="button" data-action="fbSetCat" data-cat="${v}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;pointer-events:auto">${l}</button>`
      ).join('') +
      `</div>` +
      `<div data-role="fb-comment-wrap" style="display:block;margin-top:10px">` +
      `<textarea data-role="fb-comment" maxlength="2000" rows="2" placeholder="Anything specific? Totally optional." style="width:100%;box-sizing:border-box;background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:8px;font:inherit;color:inherit;resize:vertical"></textarea>` +
      `<div data-role="fb-counter" style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:2px">0/2000</div>` +
      `</div>` +
      `<div data-role="fb-actions" style="display:flex;gap:8px;margin-top:8px">` +
      `<button type="button" data-action="fbSubmit" style="background:var(--ocean-glow);border:1px solid var(--border-mid);border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--ocean);cursor:pointer;pointer-events:auto">Send feedback</button>` +
      `<button type="button" data-action="fbSkip" style="background:transparent;border:1px solid var(--border-default);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--text-muted);cursor:pointer;pointer-events:auto">Not now</button>` +
      `</div>` +
      `</div>`
  );
}

export function fbSetStar(btn) {
  const card = btn.closest('[data-role="fb-card"]');
  if (!card) return;
  const n = parseInt(btn.dataset.n, 10);
  card.dataset.rating = String(n);
  card.querySelectorAll('[data-action="fbSetStar"]').forEach((s) => {
    const sn = parseInt(s.dataset.n, 10);
    s.textContent = sn <= n ? '★' : '☆';
  });
  const tags = card.querySelector('[data-role="fb-tags"]');
  const commentWrap = card.querySelector('[data-role="fb-comment-wrap"]');
  const actions = card.querySelector('[data-role="fb-actions"]');
  if (tags) tags.style.display = 'flex';
  if (commentWrap) commentWrap.style.display = 'block';
  if (actions) actions.style.display = 'flex';
}

export function fbSetCat(btn) {
  const card = btn.closest('[data-role="fb-card"]');
  if (!card) return;
  const cat = btn.dataset.cat;
  const already = card.dataset.cat === cat;
  card.dataset.cat = already ? '' : cat;
  card.querySelectorAll('[data-action="fbSetCat"]').forEach((t) => {
    const on = !already && t.dataset.cat === cat;
    t.style.background = on ? 'var(--ocean-glow)' : 'var(--bg-glass)';
    t.style.borderColor = on ? 'var(--ocean)' : 'var(--border-default)';
  });
}

export function updateFbCounter(el) {
  const card = el.closest('[data-role="fb-card"]');
  if (!card) return;
  const counter = card.querySelector('[data-role="fb-counter"]');
  if (counter) counter.textContent = `${el.value.length}/2000`;
}

export function fbSkip(btn) {
  const card = btn.closest('[data-role="fb-card"]');
  if (!card) return;
  card.outerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">No worries — you can always tap "App Feedback" again later 👋</div>`;
}

export async function fbSubmit(btn, { API, currentCityId, showToast, addMsg, viewIds }) {
  const card = btn.closest('[data-role="fb-card"]');
  if (!card) return;
  const rating = parseInt(card.dataset.rating, 10) || 0;
  if (!rating) {
    if (typeof showToast === 'function') showToast('⭐', 'Pick a star rating', 'Tap 1–5 stars above, then send.', 2500);
    else alert('Please pick a star rating (1–5) before sending.');
    return;
  }
  const cat = card.dataset.cat || 'general';
  const commentEl = card.querySelector('[data-role="fb-comment"]');
  const message = commentEl ? commentEl.value.trim() : '';
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const activeViewId = viewIds && viewIds.find((v) => document.getElementById(v)?.classList.contains('active'));
    await API.submitAppFeedback(rating, cat, message || null, activeViewId || currentCityId || null);
    card.outerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">🙏 <strong>Thank you</strong> — feedback like this is exactly what helps us build the right things next.</div>`;
    showToast('💬', 'Feedback sent', 'Thanks for helping us improve India In-Time!', 3500);
  } catch (_e) {
    btn.disabled = false;
    btn.textContent = 'Send feedback';
    addMsg('⚠️ Could not send feedback right now — please try again in a moment.');
  }
}
