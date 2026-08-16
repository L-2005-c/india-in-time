import { watchAdminAuth, signInAdmin, adminFetch } from '/admin-auth.js';

let ADMIN_READY = false;

function stars(n){ return '★'.repeat(n) + '<span style="color:#3a3a4a">' + '★'.repeat(5-n) + '</span>'; }
function fmtTime(t){ const d = new Date(t); return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}) + ' · ' + d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function apiGet(path){
  const res = await adminFetch(path);
  if(!res.ok){ const e = await res.json().catch(()=>({error:'Request failed'})); throw new Error(e.error || 'Request failed'); }
  return res.json();
}

async function unlock(){
  try { await signInAdmin(); }
  catch(e){ document.getElementById('admin-auth-status').textContent = e.message || String(e); }
}

function showTab(name){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}

let appFbRows = [];
const CAT_LABELS = {love_it:'Loving it 😍',bug:'Found a bug 🐛',feature_request:'Missing something 💡',confusing:'Confusing 🤔',general:'Just general 💭'};

async function loadAll(){
  try{
    const [appFb, placeFb] = await Promise.all([
      apiGet('/api/feedback/app?limit=200'),
      apiGet('/api/feedback/place/all?limit=300'),
    ]);
    renderStats(appFb, placeFb);
    appFbRows = appFb.recent || [];
    renderCatBreakdown(appFbRows);
    renderApp();
    renderPlace(placeFb.rows || []);
  }catch(e){
    alert('Could not load feedback: ' + e.message);
  }
}

function renderCatBreakdown(rows){
  const counts = {};
  rows.forEach(r => { const c = r.category || 'general'; counts[c] = (counts[c]||0) + 1; });
  document.getElementById('cat-breakdown').innerHTML = Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .map(([cat,n]) => `<span class="cat-chip"><b>${n}</b> ${esc(CAT_LABELS[cat] || cat)}</span>`)
    .join('') || '';
}

function renderStats(appFb, placeFb){
  const placeAvg = placeFb.rows.length ? (placeFb.rows.reduce((s,r)=>s+r.rating,0) / placeFb.rows.length).toFixed(2) : '—';
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${appFb.count ?? 0}</div><div class="lbl">App feedback</div></div>
    <div class="stat"><div class="num">${appFb.avg_rating ?? '—'} ★</div><div class="lbl">Avg app rating</div></div>
    <div class="stat"><div class="num">${placeFb.count ?? 0}</div><div class="lbl">Place ratings</div></div>
    <div class="stat"><div class="num">${placeAvg} ★</div><div class="lbl">Avg place rating</div></div>
  `;
}

function renderApp(){
  const catF = document.getElementById('f-cat').value;
  const ratingF = document.getElementById('f-rating').value;
  const searchF = document.getElementById('f-search').value.trim().toLowerCase();
  const rows = appFbRows.filter(r => {
    if(catF && (r.category || 'general') !== catF) return false;
    if(ratingF){
      const rf = parseInt(ratingF, 10);
      if(rf >= 3 ? r.rating < rf : r.rating > rf) return false;
    }
    if(searchF && !(r.message || '').toLowerCase().includes(searchF)) return false;
    return true;
  });
  const tbody = document.querySelector('#tbl-app tbody');
  const emptyEl = document.getElementById('empty-app');
  emptyEl.style.display = rows.length ? 'none' : 'block';
  emptyEl.textContent = appFbRows.length
    ? 'No feedback matches these filters.'
    : 'No app feedback yet — once someone taps "App Feedback" in the drawer, it shows up here.';
  document.getElementById('tbl-app').style.display = rows.length ? 'table' : 'none';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="time">${fmtTime(r.created_at)}</td>
      <td class="stars">${stars(r.rating)}</td>
      <td><span class="cat">${esc(r.category||'general')}</span></td>
      <td class="comment">${esc(r.message) || '—'}</td>
      <td class="time">${esc(r.context) || '—'}</td>
    </tr>`).join('');
}

function renderPlace(rows){
  const tbody = document.querySelector('#tbl-place tbody');
  document.getElementById('empty-place').style.display = rows.length ? 'none' : 'block';
  document.getElementById('tbl-place').style.display = rows.length ? 'table' : 'none';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="time">${fmtTime(r.created_at)}</td>
      <td><strong>${esc(r.place_name)}</strong></td>
      <td>${esc(r.city)}</td>
      <td class="stars">${stars(r.rating)}</td>
      <td>${r.accurate === true ? '<span class="acc-yes">✓ Accurate</span>' : r.accurate === false ? '<span class="acc-no">✗ Off</span>' : '<span class="acc-unk">—</span>'}</td>
      <td class="comment">${esc(r.comment) || '—'}</td>
    </tr>`).join('');
}


// ── Delegated action handling (replaces the onclick attributes above) ───────
const ADMIN_ACTIONS = {
  unlock, loadAll,
  showTab: (el) => showTab(el.dataset.tab),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ADMIN_ACTIONS[el.dataset.action];
  if (fn) fn(el);
});


const signIn = document.getElementById('admin-sign-in');
signIn.addEventListener('click', unlock);

watchAdminAuth({
  onSignedIn(user){
    ADMIN_READY = true;
    document.getElementById('gate').style.display = 'none';
    document.getElementById('dash').style.display = 'block';
    document.getElementById('admin-auth-status').textContent = `Authenticated as ${user.email || user.displayName || 'administrator'}.`;
    signIn.textContent = `Signed in: ${user.email || user.displayName || 'Admin'}`;
    loadAll();
  },
  onSignedOut(message){
    ADMIN_READY = false;
    document.getElementById('gate').style.display = 'block';
    document.getElementById('dash').style.display = 'none';
    document.getElementById('admin-auth-status').textContent = message || 'Use an account with the Firebase admin custom claim.';
  },
});

['f-cat','f-rating'].forEach(id => document.getElementById(id)?.addEventListener('change', renderApp));
document.getElementById('f-search')?.addEventListener('input', renderApp);
