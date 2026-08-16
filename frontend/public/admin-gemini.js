import { watchAdminAuth, signInAdmin, adminFetch } from './admin-auth.js';

const loadBtn = document.getElementById('load');
const signInBtn = document.getElementById('sign-in');
const authState = document.getElementById('auth-state');
const status = document.getElementById('status');
let isAdmin = false;

watchAdminAuth({
  onSignedIn(user) {
    isAdmin = true;
    loadBtn.disabled = false;
    signInBtn.textContent = `Signed in: ${user.email || user.displayName || 'Admin'}`;
    authState.textContent = 'Administrator authenticated.';
    load();
  },
  onSignedOut(message = 'Administrator sign-in required.') {
    isAdmin = false;
    loadBtn.disabled = true;
    authState.textContent = message;
    status.textContent = 'Use an account with the Firebase admin custom claim.';
  },
});

signInBtn.addEventListener('click', async () => {
  try { await signInAdmin(); }
  catch (e) { status.textContent = e.message || String(e); status.className = 'muted err'; }
});
loadBtn.addEventListener('click', load);

async function load() {
  if (!isAdmin) return;
  const hours = document.getElementById('hours').value || 24;
  status.textContent = 'Loading…';
  status.className = 'muted';
  try {
    const res = await adminFetch('/api/analytics/gemini?hours=' + encodeURIComponent(hours));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    document.getElementById('cost').textContent = '$' + (data.estimatedCostUsd ?? 0);
    document.getElementById('note').textContent = data.note || '';
    document.getElementById('live').textContent = JSON.stringify(data.live || {}, null, 2);
    const rows = (data.byModel || []).map(r =>
      `<tr><td>${escapeHtml(r.model || '—')}</td><td>${r.calls}</td><td>${r.successes}</td><td>${r.cached}</td><td>${r.tokens_in}</td><td>${r.tokens_out}</td><td>${r.avg_latency_ms ?? '—'}</td></tr>`
    ).join('') || '<tr><td colspan="7" class="muted">No data yet</td></tr>';
    document.getElementById('rows').innerHTML = rows;
    status.textContent = 'Updated ' + new Date().toLocaleString();
  } catch (e) {
    status.textContent = e.message || String(e);
    status.className = 'err';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}
