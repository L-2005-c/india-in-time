const modalState = new Map();

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(modal) {
  return [...modal.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(element => element.offsetParent !== null || element === document.activeElement);
}

function handleModalKeydown(event, modalId) {
  const state = modalState.get(modalId);
  if (!state) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal(modalId);
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = getFocusable(state.element);
  if (!focusable.length) {
    event.preventDefault();
    state.element.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openModal(modalId, trigger = document.activeElement) {
  const element = document.getElementById(modalId);
  if (!element) return;

  let state = modalState.get(modalId);
  if (!state) {
    const onKeydown = event => handleModalKeydown(event, modalId);
    const onClick = event => {
      if (event.target === element) closeModal(modalId);
    };
    state = { element, onKeydown, onClick, trigger: null };
    modalState.set(modalId, state);
    element.addEventListener('keydown', onKeydown);
    element.addEventListener('click', onClick);
  }

  state.trigger = typeof HTMLElement !== 'undefined' && trigger instanceof HTMLElement ? trigger : null;
  element.style.display = 'flex';
  element.setAttribute('aria-hidden', 'false');
  const firstFocusable = getFocusable(element)[0];
  (firstFocusable || element).focus();
}

export function closeModal(modalId) {
  const state = modalState.get(modalId);
  const element = state?.element || document.getElementById(modalId);
  if (!element) return;

  element.style.display = 'none';
  element.setAttribute('aria-hidden', 'true');
  if (state?.trigger?.isConnected) state.trigger.focus();
  if (state) state.trigger = null;
}