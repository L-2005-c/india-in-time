/**
 * frontend/app-src/src/controllers/toolsController.js
 * Utility tools, budget tracker, offline travel pass, PDF export, and exclusive smart features.
 */

export function createToolsController({
  API,
  escapeHtml,
  formatAiText,
  addMsg,
  addTypingIndicator,
  switchToView,
  _showToast,
  _fmtM,
  saveUserData
}) {
  function renderToolsHome() {
    const s = window.stamps?.size || 0;
    const c = window.currentCityName || 'India';
    const mdPlan = window.mdPlan || [];
    const totalStops = mdPlan.length ? mdPlan.reduce((sum, day) => sum + day.length, 0) : (window.itin?.length || 0);
    const el = document.getElementById('tools-content');
    if (!el) return;

    el.innerHTML = [
      '<div class="budget-card" style="margin-bottom:18px;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,212,184,.08));border-color:rgba(0,212,255,.15)">',
        '<div class="budget-row">',
          `<div><div class="inp-lbl">Trip snapshot</div><div class="tools-section-title" style="margin:4px 0 0;font-size:18px;letter-spacing:0;color:var(--text-primary);text-transform:none">${escapeHtml(c)}</div></div>`,
          `<div class="bud-rem" style="font-size:18px">${totalStops || window.LOCS?.length || 0}</div>`,
        '</div>',
        `<div class="bud-meta" style="margin-top:10px"><span>${mdPlan.length ? 'Generated itinerary ready to explore' : 'Planner ready for your next route build'}</span><span>${s} passport stamps</span></div>`,
      '</div>',

      // UTILITIES
      '<div class="tools-section-title">Utilities</div>',
      '<div class="tool-cards">',
        '<div class="tool-card" data-action="renderLingo"><div class="tool-icon">🗣️</div><div class="tool-name">Lingo</div><div class="tool-desc">Local phrases</div></div>',
        '<div class="tool-card" data-action="renderSafety"><div class="tool-icon">🚨</div><div class="tool-name">Safety</div><div class="tool-desc">Emergency contacts</div></div>',
        '<div class="tool-card" data-action="renderBudget"><div class="tool-icon">💸</div><div class="tool-name">Budget</div><div class="tool-desc">Expense splitter</div></div>',
        '<div class="tool-card" data-action="renderPassport"><div class="tool-icon">🛂</div><div class="tool-name">Passport</div><div class="tool-desc">' + s + ' stamps</div></div>',
      '</div>',

      // SHARE & SAVE
      '<div class="tools-section-title">Share & Save</div>',
      '<div class="tool-cards">',
        '<div class="tool-card" data-action="saveIt"><div class="tool-icon">💾</div><div class="tool-name">Save Plan</div><div class="tool-desc">Sync to cloud ☁️</div></div>',
        '<div class="tool-card" data-action="shareIt"><div class="tool-icon">📤</div><div class="tool-name">Share Trip</div><div class="tool-desc">Copy & share</div></div>',
        '<div class="tool-card" data-action="waShare"><div class="tool-icon">💬</div><div class="tool-name">WhatsApp</div><div class="tool-desc">Share to WhatsApp</div></div>',
        '<div class="tool-card" data-action="toggleLoadPanel"><div class="tool-icon">📂</div><div class="tool-name">My Plans</div><div class="tool-desc">Cloud + local ☁️</div></div>',
      '</div>',

      // EXCLUSIVE FEATURES
      '<div class="tools-section-title">🚀 Exclusive — Not on Google Maps</div>',
      '<div class="tool-cards">',
        '<div class="tool-card" data-action="showFestivalRadar"><div class="tool-icon">🎪</div><div class="tool-name">Festival Radar</div><div class="tool-desc">Events today</div></div>',
        '<div class="tool-card" data-action="showHiddenGems"><div class="tool-icon">💎</div><div class="tool-name">Hidden Gems</div><div class="tool-desc">Secret spots</div></div>',
        '<div class="tool-card" data-action="showHartaalAlert"><div class="tool-icon">⚡</div><div class="tool-name">Strike Alert</div><div class="tool-desc">Bandh warning</div></div>',
        '<div class="tool-card" data-action="showCrowdPredictor"><div class="tool-icon">🧠</div><div class="tool-name">Crowd Predictor</div><div class="tool-desc">Best time to visit</div></div>',
        '<div class="tool-card" data-action="showFareNegotiator"><div class="tool-icon">💸</div><div class="tool-name">Fare Negotiator</div><div class="tool-desc">Exact price + script</div></div>',
        '<div class="tool-card" data-action="showTripTribe"><div class="tool-icon">👥</div><div class="tool-name">Trip Tribe</div><div class="tool-desc">Find travel buddies</div></div>',
        '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="ar-in2">',
          '<div class="tool-icon">🔮</div><div><div class="tool-name">AR Overlay</div><div class="tool-desc">Point at any building for history & tips</div></div>',
          '<input type="file" id="ar-in2" accept="image/*" style="display:none" data-file-action="handleArOverlay">',
        '</div>',
        '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="food-safety-in2">',
          '<div class="tool-icon">🍡</div><div><div class="tool-name">Food Safety Scanner</div><div class="tool-desc">Is it safe to eat?</div></div>',
          '<input type="file" id="food-safety-in2" accept="image/*" style="display:none" data-file-action="handleFoodSafety">',
        '</div>',
      '</div>',

      // AI TOOLS
      '<div class="tools-section-title">AI Tools for ' + c + '</div>',
      '<div class="tool-cards">',
        '<div class="tool-card" data-action="prepGuide"><div class="tool-icon">🎒</div><div class="tool-name">Prep Guide</div><div class="tool-desc">What to pack</div></div>',
        '<div class="tool-card" data-action="getInstaSpots"><div class="tool-icon">📸</div><div class="tool-name">Insta-Spots</div><div class="tool-desc">Best photo angles</div></div>',
        '<div class="tool-card" data-action="getSouvenirGuide"><div class="tool-icon">🛍️</div><div class="tool-name">Souvenirs</div><div class="tool-desc">What to buy</div></div>',
        '<div class="tool-card" data-action="showTripRating"><div class="tool-icon">⭐</div><div class="tool-name">Rate My Trip</div><div class="tool-desc">AI trip report</div></div>',
        '<div class="tool-card" data-action="showReplanner"><div class="tool-icon">🧭</div><div class="tool-name">Replanner</div><div class="tool-desc">Running late?</div></div>',
        '<div class="tool-card" data-action="startVoiceInput"><div class="tool-icon">🎤</div><div class="tool-name">Voice AI</div><div class="tool-desc">Talk to assistant</div></div>',
        '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="caption-in2">',
          '<div class="tool-icon">📸</div><div><div class="tool-name">AI Photo Captions</div><div class="tool-desc">Instagram captions</div></div>',
          '<input type="file" id="caption-in2" accept="image/*" style="display:none" data-file-action="handleCaption">',
        '</div>',
        '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="translate-in2">',
          '<div class="tool-icon">🌐</div><div><div class="tool-name">Translate Sign / Menu</div><div class="tool-desc">Any language</div></div>',
          '<input type="file" id="translate-in2" accept="image/*" style="display:none" data-file-action="handleTranslate">',
        '</div>',
        '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="lens-in2">',
          '<div class="tool-icon">🔍</div><div><div class="tool-name">AI Lens</div><div class="tool-desc">Identify landmarks</div></div>',
          '<input type="file" id="lens-in2" accept="image/*" style="display:none" data-file-action="handleAiLens">',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderLingo() {
    switchToView('tools-view', 3, true);
    const phrases = [
      { en: 'How much is this?', te: 'Bhaiya, kitne ka hai?' },
      { en: 'Where is the washroom?', te: 'Washroom kahan hai?' },
      { en: 'Stop the auto here', te: 'Yahan rok do' },
      { en: 'No spicy please', te: 'Mirchi kam daalna' },
      { en: 'Yes / No', te: 'Haan / Nahi' },
      { en: 'Too expensive!', te: 'Bahut mehenga hai!' }
    ];
    const tc = document.getElementById('tools-content');
    if (tc) {
      tc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🗣️ Local Lingo</div></div><div class="lingo-list">${phrases.map(p => `<div class="lingo-card"><div><div class="lingo-en">${p.en}</div><div class="lingo-te">${p.te}</div></div><button class="lingo-speak" data-action="speak" data-text="${escapeHtml(p.te || '')}">🔊</button></div>`).join('')}</div>`;
    }
  }

  function renderSafety() {
    switchToView('tools-view', 3, true);
    const currentCityName = window.currentCityName || 'India';
    const cityQuery = encodeURIComponent(`${currentCityName} hospitals`);
    const nearbyQuery = encodeURIComponent(window.cLat && window.cLon ? `${window.cLat},${window.cLon} hospitals` : `hospitals near ${currentCityName}`);
    const tc = document.getElementById('tools-content');
    if (tc) {
      tc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🚨 Emergency Safety</div></div><div class="emergency-block"><div class="emergency-block-title">Urgent Help</div><div class="emergency-list"><a href="tel:112" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">National Emergency</span></div><span class="emer-num">112</span></a><a href="tel:100" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">Police</span></div><span class="emer-num">100</span></a><a href="tel:108" class="emer-card"><div class="emer-left"><span class="emer-ico">🚑</span><span class="emer-name">Ambulance</span></div><span class="emer-num">108</span></a><a href="tel:101" class="emer-card"><div class="emer-left"><span class="emer-ico">🚒</span><span class="emer-name">Fire</span></div><span class="emer-num">101</span></a><a href="tel:1091" class="emer-card"><div class="emer-left"><span class="emer-ico">👩</span><span class="emer-name">Women Helpline</span></div><span class="emer-num">1091</span></a></div></div><div class="emergency-block"><div class="emergency-block-title">Hospitals</div><div class="emergency-list"><a href="https://www.google.com/maps/search/?api=1&query=${nearbyQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🏥</span><span class="emer-name">Nearby Hospitals</span></div><span class="emer-num">Open</span></a><a href="https://www.google.com/maps/search/?api=1&query=${cityQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🩺</span><span class="emer-name">${escapeHtml(currentCityName)} Hospitals</span></div><span class="emer-num">Maps</span></a></div></div><button class="emer-share-btn" data-action="shareEmergency">📍 Share My Live Location</button>`;
    }
  }

  function updateBudget() {
    const expenses = window.expenses || [];
    const lim = parseFloat(document.getElementById('bud-limit')?.value) || 0;
    const grp = Math.max(1, parseInt(document.getElementById('grp-sz')?.value, 10) || 1);
    const sp = expenses.reduce((s, e) => s + e.c, 0);
    const rem = lim - sp;
    const re = document.getElementById('bud-rem');
    if (re) {
      re.textContent = `₹${rem}`;
      re.style.color = rem < 0 ? '#f87171' : rem < lim * 0.2 ? '#fcd34d' : 'var(--jade)';
    }
    const ts = document.getElementById('bud-spent');
    if (ts) ts.textContent = `₹${sp}`;
    const pp = document.getElementById('bud-pp');
    if (pp) pp.textContent = `₹${(sp / grp).toFixed(2)}`;
    const pct = lim > 0 ? Math.min(100, (sp / lim) * 100) : 0;
    const pr = document.getElementById('bud-bar');
    if (pr) {
      pr.style.width = `${pct}%`;
      pr.style.background = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : 'var(--jade)';
    }
    const el = document.getElementById('exp-list');
    if (!el) return;
    el.innerHTML = expenses.length
      ? expenses.map(e => `<div class="exp-item"><span>${escapeHtml(e.n)}</span><div class="exp-item-right"><span style="font-weight:700">₹${e.c}</span><button class="exp-del" data-action="delExp" data-id="${e.id}">×</button></div></div>`).join('')
      : '<p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p>';
  }

  function renderBudget() {
    switchToView('tools-view', 3, true);
    const tc = document.getElementById('tools-content');
    if (tc) {
      tc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">💸 Budget Splitter</div></div><div class="budget-card"><div class="budget-row"><div class="bud-field-wrap"><div class="inp-lbl">Total Budget</div><div class="bud-currency"><span class="bud-sym">₹</span><input type="number" class="bud-inp" id="bud-limit" value="5000" data-input-action="updateBudget"></div></div><div class="bud-field-wrap"><div class="inp-lbl">Group Size</div><div class="bud-currency"><span style="font-size:18px">👥</span><input type="number" class="bud-inp" id="grp-sz" value="1" min="1" style="width:50px" data-input-action="updateBudget"></div></div><div class="bud-field-wrap" style="text-align:right"><div class="inp-lbl">Remaining</div><div class="bud-rem" id="bud-rem">₹5000</div></div></div><div class="prog-bar"><div class="prog-fill" id="bud-bar" style="width:0%"></div></div><div class="bud-meta"><span>Spent: <strong id="bud-spent">₹0</strong></span><span style="color:var(--purple);font-weight:700">Per person: <strong id="bud-pp">₹0.00</strong></span></div></div><div class="exp-add-row"><input type="text" id="exp-name" class="inp-field" placeholder="What did you buy?"><input type="number" id="exp-cost" class="inp-field small" placeholder="₹"><button class="btn-add-exp" data-action="addExpense">+</button></div><div class="exp-list" id="exp-list"><p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p></div><button class="btn-ai-budget" data-action="analyzeBudget">✨ AI Budget Analyzer</button>`;
    }
    updateBudget();
  }

  function renderPassport() {
    switchToView('tools-view', 3, true);
    const catIcon = { beach: '🏖️', temple: '🛕', food: '🍛', scenic: '⛰️' };
    const stamps = window.stamps || new Set();
    const locs = window.LOCS || [];
    const tc = document.getElementById('tools-content');
    if (tc) {
      tc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🛂 Passport — ${stamps.size} Stamps</div></div><p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-align:center">Visit places to collect stamps!</p><div class="passport-grid">${locs.map(loc => {
        const u = stamps.has(loc.id);
        return `<div class="passport-stamp${u ? ' unlocked' : ''}" data-action="${u ? 'chatAbout' : ''}" data-name="${escapeHtml(loc.name)}" role="button" tabindex="${u ? 0 : -1}" style="${!u ? 'opacity:0.55;filter:grayscale(1)' : ''}"><div class="stamp-icon">${u ? (catIcon[loc.cat] || '📍') : '🔒'}</div><div class="stamp-name${u ? ' unlocked' : ''}">${escapeHtml(loc.name)}</div>${u ? '<div class="stamp-badge">✓</div>' : ''}</div>`;
      }).join('')}</div>`;
    }
  }

  function addExpense() {
    const ni = document.getElementById('exp-name');
    const ci = document.getElementById('exp-cost');
    if (!ni || !ci) return;
    const n = ni.value.trim();
    const c = parseFloat(ci.value);
    if (!n || isNaN(c) || c <= 0) return;
    window.expenses = window.expenses || [];
    window.expenses.push({ id: Date.now(), n, c });
    ni.value = '';
    ci.value = '';
    updateBudget();
    if (window.currentUser && typeof saveUserData === 'function') saveUserData();
  }

  function delExp(id) {
    window.expenses = (window.expenses || []).filter(e => e.id !== id);
    updateBudget();
  }

  async function analyzeBudget() {
    const expenses = window.expenses || [];
    if (!expenses.length) {
      alert('Add expenses first!');
      return;
    }
    const total = expenses.reduce((s, e) => s + e.c, 0);
    const limit = document.getElementById('bud-limit')?.value || 5000;
    renderToolsHome();
    switchToView('chat-view', 2);
    addMsg(`<span style="color:var(--jade)">💰 Analyzing your budget…</span>`);
    const typing = addTypingIndicator();
    try {
      const t = await API.aiBudgetAnalysis(window.currentCityName || 'India', limit, total, expenses);
      typing.remove();
      addMsg(t ? formatAiText(t) : '💡 Autos are 30% cheaper than app cabs!');
    } catch {
      typing.remove();
      addMsg('💡 Autos are 30% cheaper than app cabs!');
    }
  }

  return {
    renderToolsHome,
    renderLingo,
    renderSafety,
    renderBudget,
    renderPassport,
    updateBudget,
    addExpense,
    delExp,
    analyzeBudget,
  };
}
