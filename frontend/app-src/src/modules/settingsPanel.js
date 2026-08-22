import { showToast } from './notifications.js';
import { openModal, closeModal } from '../a11y/modal.js';

// Must match LOCAL_PLANS_KEY in core/app.js — duplicated here rather than
// imported to avoid a core/app.js -> modules -> core/app.js import cycle.
const LOCAL_PLANS_KEY = 'india_in_time_saved_plans_v1';

// ── Settings modal ───────────────────────────────────────────────────────────
export function openSettings() {
  const user = window.currentUser || null;
  const nameEl = document.getElementById('set-name');
  const emailEl = document.getElementById('set-email');
  const avatarEl = document.getElementById('set-avatar');
  const fallbackEl = document.getElementById('set-avatar-fallback');
  if (nameEl) nameEl.textContent = user?.displayName || 'Traveller';
  if (emailEl) emailEl.textContent = user?.email || '';
  if (user?.photoURL && avatarEl) {
    avatarEl.src = user.photoURL;
    avatarEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';
  } else {
    if (avatarEl) avatarEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'flex';
  }
  const installRow = document.getElementById('settings-install-row');
  const installBtn = document.getElementById('install-app-btn');
  if (installRow) installRow.style.display = (installBtn && installBtn.style.display !== 'none') ? 'flex' : 'none';
  document.getElementById('user-menu')?.classList.remove('open');
  openModal('settings-modal');
}
export function closeSettings() {
  closeModal('settings-modal');
}
export function clearLocalData() {
  if (!window.confirm('Remove locally saved plans and cached data from this device? This does not affect plans saved to your account.')) return;
  try {
    localStorage.removeItem(LOCAL_PLANS_KEY);
    showToast('🗑️', 'Cleared', 'Local device data removed.');
  } catch (_e) {}
}

// ── First-run onboarding ─────────────────────────────────────────────────────
const ONBOARDING_KEY = 'tt_onboarded_v1';
const ONBOARDING_SLIDE_COUNT = 3;
let onboardingStep = 0;

export function maybeShowOnboarding() {
  try {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
  } catch (_e) { return; }
  onboardingStep = 0;
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
}
function renderOnboardingStep() {
  document.querySelectorAll('.onboarding-slide').forEach((el, i) => {
    el.classList.toggle('active', i === onboardingStep);
  });
  document.querySelectorAll('.onboarding-dot').forEach((el, i) => {
    el.classList.toggle('active', i === onboardingStep);
  });
  const nextBtn = document.querySelector('.onboarding-next');
  if (nextBtn) nextBtn.textContent = onboardingStep === ONBOARDING_SLIDE_COUNT - 1 ? 'Get Started' : 'Next';
}
function completeOnboarding() {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch (_e) {}
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'none';
}
export function advanceOnboarding() {
  if (onboardingStep >= ONBOARDING_SLIDE_COUNT - 1) { completeOnboarding(); return; }
  onboardingStep += 1;
  renderOnboardingStep();
}
export function skipOnboarding() { completeOnboarding(); }
