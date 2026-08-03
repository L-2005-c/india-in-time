// ══════════════════════════════════════════════════
// Tools Home View — replaces renderToolsHome() with all
// 28 inline onclick= handlers replaced by data-action delegation
// ══════════════════════════════════════════════════
import { registerActions } from '../core/events.js';
import { escapeHtml } from '../core/dom.js';

/**
 * Render the tools grid into #tools-content.
 * All tool cards use data-action instead of inline onclick.
 */
export function renderToolsHome(deps) {
  const { state, renderLingo, renderSafety, renderBudget, renderPassport,
    saveIt, shareIt, waShare, toggleLoadPanel,
    showFestivalRadar, showHiddenGems, showHartaalAlert, showCrowdPredictor,
    showFareNegotiator, showTripTribe, prepGuide, getInstaSpots,
    getSouvenirGuide, showTripRating, showReplanner, startVoiceInput } = deps;

  const s = state.stamps.size;
  const c = state.currentCityName;
  const totalStops = state.mdPlan.length ? state.mdPlan.reduce((sum, day) => sum + day.length, 0) : 0;
  const el = document.getElementById('tools-content');
  if (!el) return;

  el.innerHTML = [
    '<div class="budget-card" style="margin-bottom:18px;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,212,184,.08));border-color:rgba(0,212,255,.15)">',
      '<div class="budget-row">',
        `<div><div class="inp-lbl">Trip snapshot</div><div class="tools-section-title" style="margin:4px 0 0;font-size:18px;letter-spacing:0;color:var(--text-primary);text-transform:none">${escapeHtml(c)}</div></div>`,
        `<div class="bud-rem" style="font-size:18px">${totalStops || state.LOCS.length || 0}</div>`,
      '</div>',
      `<div class="bud-meta" style="margin-top:10px"><span>${state.mdPlan.length ? 'Generated itinerary ready to explore' : 'Planner ready for your next route build'}</span><span>${s} passport stamps</span></div>`,
    '</div>',

    // UTILITIES
    '<div class="tools-section-title">Utilities</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="renderLingo"><div class="tool-icon">🗣️</div><div class="tool-name">Lingo</div><div class="tool-desc">Local phrases</div></div>',
      '<div class="tool-card" data-action="renderSafety"><div class="tool-icon">🚨</div><div class="tool-name">Safety</div><div class="tool-desc">Emergency contacts</div></div>',
      '<div class="tool-card" data-action="renderBudget"><div class="tool-icon">💸</div><div class="tool-name">Budget</div><div class="tool-desc">Expense splitter</div></div>',
      `<div class="tool-card" data-action="renderPassport"><div class="tool-icon">🛂</div><div class="tool-name">Passport</div><div class="tool-desc">${s} stamps</div></div>`,
    '</div>',

    // SHARE & SAVE
    '<div class="tools-section-title">Share & Save</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="saveIt"><div class="tool-icon">💾</div><div class="tool-name">Save Plan</div><div class="tool-desc">Sync to cloud ☁️</div></div>',
      '<div class="tool-card" data-action="shareIt"><div class="tool-icon">📤</div><div class="tool-name">Share Trip</div><div class="tool-desc">Copy & share</div></div>',
      '<div class="tool-card" data-action="waShare"><div class="tool-icon">💬</div><div class="tool-name">WhatsApp</div><div class="tool-desc">Share to WhatsApp</div></div>',
      '<div class="tool-card" data-action="toggleLoadPanel"><div class="tool-icon">📂</div><div class="tool-name">My Plans</div><div class="tool-desc">Cloud + local ☁️</div></div>',
    '</div>',

    // EXCLUSIVE — 8 NEW FEATURES
    '<div class="tools-section-title">🚀 Exclusive — Not on Google Maps</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="showFestivalRadar"><div class="tool-icon">🎪</div><div class="tool-name">Festival Radar</div><div class="tool-desc">Events today</div></div>',
      '<div class="tool-card" data-action="showHiddenGems"><div class="tool-icon">💎</div><div class="tool-name">Hidden Gems</div><div class="tool-desc">Secret spots</div></div>',
      '<div class="tool-card" data-action="showHartaalAlert"><div class="tool-icon">⚡</div><div class="tool-name">Strike Alert</div><div class="tool-desc">Bandh warning</div></div>',
      '<div class="tool-card" data-action="showCrowdPredictor"><div class="tool-icon">🧠</div><div class="tool-name">Crowd Predictor</div><div class="tool-desc">Best time to visit</div></div>',
      '<div class="tool-card" data-action="showFareNegotiator"><div class="tool-icon">💸</div><div class="tool-name">Fare Negotiator</div><div class="tool-desc">Exact price + script</div></div>',
      '<div class="tool-card" data-action="showTripTribe"><div class="tool-icon">👥</div><div class="tool-name">Trip Tribe</div><div class="tool-desc">Find travel buddies</div></div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="triggerArOverlay">',
        '<div class="tool-icon">🔮</div><div><div class="tool-name">AR Overlay</div><div class="tool-desc">Point at any building for history & tips</div></div>',
        '<input type="file" id="ar-in2" accept="image/*" style="display:none" data-action="handleArOverlay">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="triggerFoodSafety">',
        '<div class="tool-icon">🍡</div><div><div class="tool-name">Food Safety Scanner</div><div class="tool-desc">Is it safe to eat?</div></div>',
        '<input type="file" id="food-safety-in2" accept="image/*" style="display:none" data-action="handleFoodSafety">',
      '</div>',
    '</div>',

    // AI TOOLS
    `<div class="tools-section-title">AI Tools for ${escapeHtml(c)}</div>`,
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="prepGuide"><div class="tool-icon">🎒</div><div class="tool-name">Prep Guide</div><div class="tool-desc">What to pack</div></div>',
      '<div class="tool-card" data-action="getInstaSpots"><div class="tool-icon">📸</div><div class="tool-name">Insta-Spots</div><div class="tool-desc">Best photo angles</div></div>',
      '<div class="tool-card" data-action="getSouvenirGuide"><div class="tool-icon">🛍️</div><div class="tool-name">Souvenirs</div><div class="tool-desc">What to buy</div></div>',
      '<div class="tool-card" data-action="showTripRating"><div class="tool-icon">⭐</div><div class="tool-name">Rate My Trip</div><div class="tool-desc">AI trip report</div></div>',
      '<div class="tool-card" data-action="showReplanner"><div class="tool-icon">🧭</div><div class="tool-name">Replanner</div><div class="tool-desc">Running late?</div></div>',
      '<div class="tool-card" data-action="startVoiceInput"><div class="tool-icon">🎤</div><div class="tool-name">Voice AI</div><div class="tool-desc">Talk to assistant</div></div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="triggerCaption">',
        '<div class="tool-icon">📸</div><div><div class="tool-name">AI Photo Captions</div><div class="tool-desc">Instagram captions</div></div>',
        '<input type="file" id="caption-in2" accept="image/*" style="display:none" data-action="handleCaption">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="triggerTranslate">',
        '<div class="tool-icon">🌐</div><div><div class="tool-name">Translate Sign / Menu</div><div class="tool-desc">Any language</div></div>',
        '<input type="file" id="translate-in2" accept="image/*" style="display:none" data-action="handleTranslate">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="triggerAiLens">',
        '<div class="tool-icon">🔍</div><div><div class="tool-name">AI Lens</div><div class="tool-desc">Identify landmarks</div></div>',
        '<input type="file" id="lens-in2" accept="image/*" style="display:none" data-action="handleAiLens">',
      '</div>',
    '</div>'
  ].join('');
}

/**
 * Register all tools-home actions with the delegation system.
 * File-input triggers use click() to open the picker; the actual
 * file-change handlers are registered as change-event data-actions.
 */
export function registerToolsHomeActions(deps) {
  registerActions({
    // Utilities
    renderLingo:     () => deps.renderLingo(),
    renderSafety:    () => deps.renderSafety(),
    renderBudget:    () => deps.renderBudget(),
    renderPassport:  () => deps.renderPassport(),

    // Share & Save
    saveIt:          () => deps.saveIt(),
    shareIt:         () => deps.shareIt(),
    waShare:         () => deps.waShare(),
    toggleLoadPanel: () => deps.toggleLoadPanel(),

    // Exclusive features
    showFestivalRadar:  () => deps.showFestivalRadar(),
    showHiddenGems:     () => deps.showHiddenGems(),
    showHartaalAlert:   () => deps.showHartaalAlert(),
    showCrowdPredictor: () => deps.showCrowdPredictor(),
    showFareNegotiator: () => deps.showFareNegotiator(),
    showTripTribe:      () => deps.showTripTribe(),

    // File-input triggers: click the hidden <input type="file">
    triggerArOverlay:  () => document.getElementById('ar-in2')?.click(),
    triggerFoodSafety: () => document.getElementById('food-safety-in2')?.click(),
    triggerCaption:    () => document.getElementById('caption-in2')?.click(),
    triggerTranslate:  () => document.getElementById('translate-in2')?.click(),
    triggerAiLens:     () => document.getElementById('lens-in2')?.click(),

    // File-change handlers (registered in events.js change delegation)
    handleArOverlay:  (el) => deps.handleArOverlay({ target: { files: el.files } }),
    handleFoodSafety: (el) => deps.handleFoodSafety({ target: { files: el.files } }),
    handleCaption:    (el) => deps.handleCaption({ target: { files: el.files } }),
    handleTranslate:  (el) => deps.handleTranslate({ target: { files: el.files } }),
    handleAiLens:     (el) => deps.handleAiLens({ target: { files: el.files } }),

    // AI Tools
    prepGuide:       () => deps.prepGuide(),
    getInstaSpots:   () => deps.getInstaSpots(),
    getSouvenirGuide:() => deps.getSouvenirGuide(),
    showTripRating:  () => deps.showTripRating(),
    showReplanner:   () => deps.showReplanner(),
    startVoiceInput: () => deps.startVoiceInput(),
  });
}
