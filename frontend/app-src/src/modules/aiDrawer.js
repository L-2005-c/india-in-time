/**
 * frontend/app-src/src/modules/aiDrawer.js
 *
 * Side drawer presentation and interaction manager for AI Tools and Camera features.
 */

export function openAiDrawer() {
  const overlay = document.getElementById('ai-drawer-overlay');
  const drawer = document.getElementById('ai-drawer');
  if (overlay) overlay.style.display = 'block';
  if (drawer) {
    drawer.style.display = 'block';
    setTimeout(() => { drawer.style.transform = 'translateY(0)'; }, 10);
  }
  renderDrawerContent();
}

export function closeAiDrawer() {
  const drawer = document.getElementById('ai-drawer');
  const overlay = document.getElementById('ai-drawer-overlay');
  if (drawer) {
    drawer.style.transform = 'translateY(110%)';
    setTimeout(() => {
      drawer.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    }, 320);
  }
}

export function drawerBtn(icon, name, desc, action, accentColor = '') {
  const border = accentColor ? `border-color:${accentColor};` : '';
  const actionName = String(action || '').replace(/\(\)$/, '');
  return `<div class="drawer-item" style="${border}" role="button" tabindex="0" data-action="drawerRun" data-run="${actionName}">
    <div class="drawer-item-icon">${icon}</div>
    <div class="drawer-item-body">
      <div class="drawer-item-name">${name}</div>
      <div class="drawer-item-desc">${desc}</div>
    </div>
    <span style="color:var(--text-muted);font-size:14px;">›</span>
  </div>`;
}

export function drawerFileBtn(icon, name, desc, inputId, accentColor = '') {
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

export function renderDrawerContent() {
  const el = document.getElementById('ai-drawer-content');
  if (!el) return;

  el.innerHTML = [
    // ── TRIP TOOLS ──
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

    // ── EXCLUSIVE ──
    '<div class="drawer-sec">🚀 Exclusive — Not on Google Maps</div>',
    drawerBtn('⏰', 'Time Intelligence Engine', 'When should I visit — for the best experience?', 'showCrowdPredictor', 'rgba(0,180,255,.5)'),
    drawerBtn('🎪', 'Festival Radar', 'Events & festivals happening TODAY', 'showFestivalRadar', 'rgba(255,165,0,.4)'),
    drawerBtn('💎', 'Hidden Gems', 'Verified spots Google Maps buries', 'showHiddenGems', 'rgba(168,85,247,.4)'),
    drawerBtn('⚡', 'Strike Alert', 'Power cuts & bandh warnings', 'showHartaalAlert', 'rgba(255,80,80,.4)'),
    drawerBtn('💸', 'Fare Negotiator', 'Exact auto price + Hindi script', 'showFareNegotiator', 'rgba(50,200,150,.4)'),
    drawerBtn('👥', 'Trip Tribe', 'Find travel buddies nearby', 'showTripTribe', 'rgba(200,100,255,.4)'),

    // ── CAMERA AI ──
    '<div class="drawer-sec">📸 Camera AI</div>',
    drawerFileBtn('🔍', 'AI Lens', 'Identify any landmark', 'lens-in', 'rgba(0,200,240,.3)'),
    drawerFileBtn('🔮', 'AR Overlay', 'History & tips for any building', 'ar-in', 'rgba(150,100,255,.3)'),
    drawerFileBtn('🍡', 'Food Safety Scanner', 'Is this street food safe?', 'food-safety-in', 'rgba(255,200,50,.3)'),
    drawerFileBtn('📸', 'Photo Captions', 'Instagram captions for your photos', 'caption-in', 'rgba(0,229,160,.3)'),
    drawerFileBtn('🌐', 'Translate Sign/Menu', 'Translate any text in a photo', 'translate-in', 'rgba(255,107,138,.3)'),

    '<div style="height:20px;"></div>',
  ].join('');
}
