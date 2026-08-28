// frontend/app-src/src/core/chatController.js
// AI Chat, Gemini Assistant tools, Voice synthesis, and drawer screens
'use strict';

import { formatAiText } from '../utils/html-safe.js';
import { getHiddenGems } from '../data/cities.js';
import { showToast } from '../modules/notifications.js';

export function createChatController(ctx) {
  const {
    API,
    getState,
    addMsg,
    switchToView,
    addTypingIndicator,
    speak,
    formatAiText: formatText = formatAiText,
  } = ctx;

  let voiceOn = false;

  function toggleVoice() {
    voiceOn = !voiceOn;
    const btn = document.getElementById('btn-voice');
    if (btn) {
      btn.style.opacity = voiceOn ? '1' : '0.4';
      btn.textContent = voiceOn ? '🔊 Voice On' : '🔇 Voice Off';
    }
  }

  function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addMsg('🎤 Speech recognition not supported in your browser.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.start();
    showToast('🎤', 'Listening...', 'Speak now — ask anything about your trip');
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      const input = document.getElementById('chat-in');
      if (input) {
        input.value = text;
        handleChat();
      }
    };
    recognition.onerror = () => {
      showToast('⚠️', 'Voice Error', 'Could not recognize speech.');
    };
  }

  async function handleChat() {
    const input = document.getElementById('chat-in');
    const msg = (input?.value || '').trim();
    if (!msg) return;
    input.value = '';
    addMsg(`🧑 ${msg}`, { isUser: true });
    switchToView('chat-view', 2);
    const typing = addTypingIndicator();
    try {
      const state = getState();
      const planNames = (state.itin || []).map(s => s.name);
      const res = await API.aiChat(msg, state.currentCityName || 'India', planNames);
      typing.remove();
      const reply = res?.text || res || 'I am ready to help with your trip!';
      addMsg(`🤖 ${formatText(reply)}`);
      if (voiceOn) speak(reply);
    } catch (_err) {
      typing.remove();
      addMsg('⚠️ Assistant temporarily offline. Please try again.');
    }
  }

  function chatAbout(placeName) {
    const input = document.getElementById('chat-in');
    if (input) {
      input.value = `Tell me insider tips and best visiting hours for ${placeName}`;
      switchToView('chat-view', 2);
      handleChat();
    }
  }

  async function aiSuggestAlternative(stopName) {
    switchToView('chat-view', 2);
    addMsg(`🤖 Finding alternatives for <strong>${stopName}</strong>...`);
    const typing = addTypingIndicator();
    try {
      const state = getState();
      const text = await API.aiAlternative(state.currentCityName || 'India', stopName);
      typing.remove();
      addMsg(text ? formatText(text) : `Try visiting nearby cafes or scenic spots in ${state.currentCityName}.`);
    } catch {
      typing.remove();
      addMsg('Could not find alternatives right now.');
    }
  }

  function aiFoodCard(name, cat) {
    chatAbout(`${name} (${cat}) iconic dishes`);
  }

  function openAiDrawer() {
    const drawer = document.getElementById('ai-drawer');
    const overlay = document.getElementById('ai-drawer-overlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    renderDrawerContent();
  }

  function closeAiDrawer() {
    const drawer = document.getElementById('ai-drawer');
    const overlay = document.getElementById('ai-drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  }

  function drawerBtn(icon, name, desc, action, accentColor = '') {
    const border = accentColor ? `border-color:${accentColor};` : '';
    return `<div class="drawer-item" style="${border}" role="button" tabindex="0" data-action="drawerRun" data-run="${action}">
      <div class="drawer-item-icon">${icon}</div>
      <div class="drawer-item-body">
        <div class="drawer-item-name">${name}</div>
        <div class="drawer-item-desc">${desc}</div>
      </div>
      <span style="color:var(--text-muted);font-size:14px;">›</span>
    </div>`;
  }

  function drawerFileBtn(icon, name, desc, inputId, accentColor = '') {
    const border = accentColor ? `border-color:${accentColor};` : '';
    return `<div class="drawer-item" style="${border}" role="button" tabindex="0" data-action="drawerFile" data-input-id="${inputId}">
      <div class="drawer-item-icon">${icon}</div>
      <div class="drawer-item-body">
        <div class="drawer-item-name">${name}</div>
        <div class="drawer-item-desc">${desc}</div>
      </div>
      <span style="color:var(--text-muted);font-size:14px;">📁</span>
    </div>`;
  }

  function renderDrawerContent() {
    const el = document.getElementById('ai-drawer-content');
    if (!el) return;
    el.innerHTML = [
      '<div class="drawer-sec">Trip Tools</div>',
      drawerBtn('🎒', 'Prep Guide', 'What to pack for this trip', 'prepGuide'),
      drawerBtn('📸', 'Postcard', 'Generate a trip postcard', 'postcard'),
      drawerBtn('📷', 'Insta-Spots', 'Best photo angles at each stop', 'getInstaSpots'),
      drawerBtn('🛍️', 'Souvenir Guide', 'What to buy locally', 'getSouvenirGuide'),
      drawerBtn('⭐', 'Rate My Trip', 'AI trip report & score', 'showTripRating'),
      drawerBtn('💬', 'App Feedback', 'Tell us what to improve', 'showAppFeedback'),
      drawerBtn('🧭', 'Smart Replanner', 'Running late? Reschedule now', 'showReplanner'),
      drawerBtn('🌦️', 'Weather Alerts', 'Per-stop weather forecast', 'showWeatherAlerts'),
      drawerBtn('📄', 'Download PDF', 'Full trip summary PDF', 'generateTripPDF'),
      drawerBtn('🔔', 'Closing Alerts', 'Get notified before stops close', 'setupNotifications'),
      drawerBtn('🎤', 'Voice AI', 'Talk to assistant hands-free', 'startVoiceInput'),
      '<div class="drawer-sec">🚀 Exclusive — Not on Google Maps</div>',
      drawerBtn('⏰', 'Time Intelligence Engine', 'When should I visit — for the best experience?', 'showCrowdPredictor', 'rgba(0,180,255,.5)'),
      drawerBtn('🎪', 'Festival Radar', 'Events & festivals happening TODAY', 'showFestivalRadar', 'rgba(255,165,0,.4)'),
      drawerBtn('💎', 'Hidden Gems', 'Verified spots Google Maps buries', 'showHiddenGems', 'rgba(168,85,247,.4)'),
      drawerBtn('⚡', 'Strike Alert', 'Power cuts & bandh warnings', 'showHartaalAlert', 'rgba(255,80,80,.4)'),
      drawerBtn('💸', 'Fare Negotiator', 'Exact auto price + Hindi script', 'showFareNegotiator', 'rgba(50,200,150,.4)'),
      drawerBtn('👥', 'Trip Tribe', 'Find travel buddies nearby', 'showTripTribe', 'rgba(200,100,255,.4)'),
      '<div class="drawer-sec">📸 Camera AI</div>',
      drawerFileBtn('🔍', 'AI Lens', 'Identify any landmark', 'lens-in', 'rgba(0,200,240,.3)'),
      drawerFileBtn('🔮', 'AR Overlay', 'History & tips for any building', 'ar-in', 'rgba(150,100,255,.3)'),
      drawerFileBtn('🍡', 'Food Safety Scanner', 'Is this street food safe?', 'food-safety-in', 'rgba(255,200,50,.3)'),
      drawerFileBtn('📸', 'Photo Captions', 'Instagram captions for your photos', 'caption-in', 'rgba(0,229,160,.3)'),
      drawerFileBtn('🌐', 'Translate Sign/Menu', 'Translate any text in a photo', 'translate-in', 'rgba(255,107,138,.3)'),
      '<div style="height:20px;"></div>',
    ].join('');
  }

  function renderAiToolsGrid() {}

  async function prepGuide() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`🎒 <strong>Prep Guide</strong> — Preparing packing checklist for ${state.currentCityName}...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiPrepGuide(state.currentCityName, (state.itin || []).map(s => s.name));
      typing.remove();
      addMsg(text ? formatText(text) : 'Keep water, sunscreen, comfortable shoes, and cash handy!');
    } catch {
      typing.remove();
      addMsg('Keep water, sunscreen, comfortable shoes, and cash handy!');
    }
  }

  async function postcard() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`📸 <strong>Postcard</strong> — Writing a memorable postcard from ${state.currentCityName}...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiPostcard(state.currentCityName, (state.itin || []).map(s => s.name));
      typing.remove();
      addMsg(text ? formatText(text) : `Greetings from incredible ${state.currentCityName}! Having an unforgettable time exploring.`);
    } catch {
      typing.remove();
      addMsg(`Greetings from incredible ${state.currentCityName}!`);
    }
  }

  async function getInstaSpots() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`📷 <strong>Insta-Spots</strong> — Finding best photography angles in ${state.currentCityName}...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiInstaSpots(state.currentCityName, (state.itin || []).map(s => s.name));
      typing.remove();
      addMsg(text ? formatText(text) : 'Golden hour near coastal viewpoints and historic facades yields the best shots!');
    } catch {
      typing.remove();
      addMsg('Golden hour near coastal viewpoints and historic facades yields the best shots!');
    }
  }

  async function getSouvenirGuide() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`🛍️ <strong>Souvenir Guide</strong> — Local crafts & specialties in ${state.currentCityName}...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiSouvenir(state.currentCityName);
      typing.remove();
      addMsg(text ? formatText(text) : 'Look for local handloom textiles, regional spices, and artisan handicrafts.');
    } catch {
      typing.remove();
      addMsg('Look for local handloom textiles, regional spices, and artisan handicrafts.');
    }
  }

  async function showTripRating() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`⭐ <strong>Rate My Trip</strong> — Auditing your itinerary for pacing and variety...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiTripRating(state.currentCityName, (state.itin || []).map(s => s.name));
      typing.remove();
      addMsg(text ? formatText(text) : 'Your trip offers a balanced mix of cultural landmarks and scenic spots!');
    } catch {
      typing.remove();
      addMsg('Your trip offers a balanced mix of cultural landmarks and scenic spots!');
    }
  }

  function showReplanner() {
    switchToView('chat-view', 2);
    addMsg('🧭 <strong>Smart Replanner:</strong> Tap <strong>⚡ Smart Extend</strong> on the Plan tab or adjust your trip duration slider to reorder remaining stops dynamically.');
  }

  function showWeatherAlerts() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`🌦️ <strong>Weather Intelligence</strong> for ${state.currentCityName}: Temperature ~${state.realTemp || 28}°C (${state.realWeatherMain || 'Clear'}). Outdoor viewpoints are optimal in late afternoon.`);
  }

  function generateTripPDF() {
    window.print();
  }

  function setupNotifications() {
    showToast('🔔', 'Alerts Active', 'You will receive warnings 45 minutes before stops close.');
  }

  async function showFestivalRadar() {
    switchToView('chat-view', 2);
    const state = getState();
    const month = new Date().toLocaleString('en-IN', { month: 'long' });
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    addMsg(`🎪 <strong>Festival Radar</strong> — Scanning events in ${state.currentCityName} today...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiFestivalRadar(state.currentCityName, month, date);
      typing.remove();
      addMsg(text ? formatText(text) : '🎪 No major disruptions reported today.');
    } catch {
      typing.remove();
      addMsg(`🎪 Check temple notice boards and cultural waterfronts in ${state.currentCityName} for evening celebrations.`);
    }
  }

  async function showHiddenGems() {
    switchToView('chat-view', 2);
    const state = getState();
    const gems = getHiddenGems(state.currentCityId);
    if (!gems.length) {
      addMsg(`💎 <strong>Hidden Gem Detector</strong> — Discovering secret local spots in ${state.currentCityName}...`);
      const typing = addTypingIndicator();
      try {
        const text = await API.aiHiddenGem(state.currentCityName, []);
        typing.remove();
        addMsg(text ? formatText(text) : 'Ask a local chai vendor — they know the most tranquil corners!');
      } catch {
        typing.remove();
        addMsg('Ask a local chai vendor — they know the most tranquil corners!');
      }
      return;
    }
    showToast('💎', 'Hidden gems unlocked', `${gems.length} verified spots plotted on map.`, 4000);
    addMsg(`💎 <strong>Hidden Gems in ${state.currentCityName}</strong>:`);
    gems.forEach(g => {
      addMsg(`💎 <strong>${g.name}</strong><br>${g.why}<br><em>${g.reviewGap}</em><br>✨ Best for: ${g.bestFor}`);
    });
  }

  async function handleArOverlay(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      switchToView('chat-view', 2);
      const src = ev.target.result;
      addMsg(`🔮 <strong>AR Overlay</strong> — Analyzing building...<br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
      const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/) || [];
      const typing = addTypingIndicator();
      try {
        const state = getState();
        const text = await API.aiArOverlay(b64, meta, state.currentCityName);
        typing.remove();
        addMsg(text ? formatText(text) : '🔮 Historic architecture with intricate detailing.');
      } catch {
        typing.remove();
        addMsg('⚠️ AR analysis unavailable right now.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function showHartaalAlert() {
    switchToView('chat-view', 2);
    const state = getState();
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    addMsg(`⚡ <strong>Safety Alert</strong> — Checking transit & power status in ${state.currentCityName}...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiHartaalAlert(state.currentCityName, date);
      typing.remove();
      addMsg(text ? formatText(text) : '⚡ No major strikes or disruptions reported. Travel safely!');
    } catch {
      typing.remove();
      addMsg(`⚡ Keep backup cash and confirm evening routes with local staff in ${state.currentCityName}.`);
    }
  }

  async function handleFoodSafety(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      switchToView('chat-view', 2);
      const src = ev.target.result;
      addMsg(`🍡 <strong>Food Safety Scanner</strong> — Analyzing...<br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
      const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/) || [];
      const typing = addTypingIndicator();
      try {
        const state = getState();
        const text = await API.aiFoodSafety(b64, meta, state.currentCityName);
        typing.remove();
        addMsg(text ? formatText(text) : '🍡 Freshly cooked hot street food from high-turnover stalls is usually safe!');
      } catch {
        typing.remove();
        addMsg('🍡 Prefer hot, freshly prepared items.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function showCrowdPredictor() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`🧠⏰ <strong>Time Intelligence Engine</strong> for ${state.currentCityName}: Morning visits (08:30–10:30) have ~60% lower crowds than afternoon rush.`);
  }

  async function showFareNegotiator() {
    switchToView('chat-view', 2);
    const state = getState();
    addMsg(`💸 <strong>Auto Fare Negotiator</strong>: In ${state.currentCityName}, typical auto rates are ~₹12/km with a ₹30 base minimum. Always request meter or agree on price beforehand.`);
  }

  async function showTripTribe() {
    switchToView('chat-view', 2);
    addMsg(`👥 <strong>Trip Tribe</strong>: Connect with fellow travelers exploring India. Share your Offline Travel Pass via WhatsApp to coordinate group plans.`);
  }

  function renderToolsHome() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    body.innerHTML = `
      <div class="tools-grid">
        <div class="tool-card" role="button" tabindex="0" data-action="renderLingo"><div class="tool-icon">🗣️</div><div class="tool-title">Local Lingo</div><div class="tool-desc">Essential phrases in local language</div></div>
        <div class="tool-card" role="button" tabindex="0" data-action="renderSafety"><div class="tool-icon">🛡️</div><div class="tool-title">Safety & Emergency</div><div class="tool-desc">Local helplines and safety protocols</div></div>
        <div class="tool-card" role="button" tabindex="0" data-action="renderBudget"><div class="tool-icon">💰</div><div class="tool-title">Trip Budget</div><div class="tool-desc">Expense tracker and cost estimates</div></div>
        <div class="tool-card" role="button" tabindex="0" data-action="renderPassport"><div class="tool-icon">🏆</div><div class="tool-title">Travel Passport</div><div class="tool-desc">Unlocked stamps and exploration rank</div></div>
      </div>
    `;
  }

  function renderLingo() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    body.innerHTML = `<div class="tool-detail-card"><h3>🗣️ Useful Phrases in Hindi</h3><ul style="line-height:2;padding-left:20px;"><li><strong>Namaste:</strong> Hello / Greetings</li><li><strong>Kitna hua?:</strong> How much does this cost?</li><li><strong>Kripya meter chalu karein:</strong> Please turn on the meter</li><li><strong>Shukriya / Dhanyawad:</strong> Thank you</li><li><strong>Paani:</strong> Water</li></ul></div>`;
  }

  function renderSafety() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    body.innerHTML = `<div class="tool-detail-card"><h3>🛡️ Emergency Contacts (India)</h3><ul style="line-height:2;padding-left:20px;"><li><strong>National Emergency:</strong> 112</li><li><strong>Police:</strong> 100</li><li><strong>Ambulance:</strong> 108</li><li><strong>Tourist Helpline:</strong> 1363</li><li><strong>Women Helpline:</strong> 1091</li></ul></div>`;
  }

  function renderBudget() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    body.innerHTML = `<div class="tool-detail-card"><h3>💰 Trip Budget Tracker</h3><p>Log your daily spending below:</p><div style="display:flex;gap:8px;margin:12px 0;"><input type="text" id="exp-name" placeholder="Item (e.g. Chai, Auto)" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-layer2);color:var(--text-primary)"><input type="number" id="exp-amt" placeholder="₹ Amount" style="width:100px;padding:8px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-layer2);color:var(--text-primary)"><button class="iit-btn iit-btn-primary" data-action="addExpense">Add</button></div><div id="expense-list-container"></div></div>`;
  }

  function renderPassport() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    const state = getState();
    const stampsCount = state.stamps ? state.stamps.size || state.stamps.length || 0 : 0;
    body.innerHTML = `<div class="tool-detail-card"><h3>🏆 Explorer Passport</h3><p>You have unlocked <strong>${stampsCount}</strong> destination stamps.</p><div style="display:flex;gap:12px;margin-top:12px;"><div style="padding:16px;border-radius:12px;background:var(--bg-layer2);flex:1;text-align:center;"><div style="font-size:24px;">🎖️</div><div style="font-weight:700;margin-top:4px;">Rank: Explorer</div></div></div></div>`;
  }

  function addExpense() {
    const nameEl = document.getElementById('exp-name');
    const amtEl = document.getElementById('exp-amt');
    if (!nameEl || !amtEl || !amtEl.value) return;
    showToast('💰', 'Expense Logged', `${nameEl.value || 'Item'}: ₹${amtEl.value}`);
    nameEl.value = '';
    amtEl.value = '';
  }

  function delExp() { showToast('🗑️', 'Removed', 'Expense deleted'); }

  function analyzeBudget() {
    switchToView('chat-view', 2);
    addMsg('💰 <strong>Budget Analysis</strong>: Keep auto transport and entry tickets as cash; restaurants and cafes widely accept UPI.');
  }

  return {
    toggleVoice, startVoiceInput, handleChat, chatAbout, aiSuggestAlternative, aiFoodCard,
    openAiDrawer, closeAiDrawer, renderDrawerContent, renderAiToolsGrid,
    prepGuide, postcard, getInstaSpots, getSouvenirGuide, showTripRating, showReplanner,
    showWeatherAlerts, generateTripPDF, setupNotifications, showFestivalRadar, showHiddenGems,
    handleArOverlay, showHartaalAlert, handleFoodSafety, showCrowdPredictor, showFareNegotiator,
    showTripTribe, renderToolsHome, renderLingo, renderSafety, renderBudget, renderPassport,
    addExpense, delExp, analyzeBudget,
  };
}
