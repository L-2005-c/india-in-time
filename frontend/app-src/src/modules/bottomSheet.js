/**
 * frontend/app-src/src/modules/bottomSheet.js
 *
 * India In-Time v3.0 — Phase 7 Reusable Bottom Sheet Component
 *
 * Provides progressive disclosure drawers for mobile and desktop:
 * - Level 2 / Level 3 explanations ("Why this?", "Trust Evidence", "Safety Details")
 * - Accessible: Escape key dismissal, role="dialog", aria-modal="true"
 * - Swipe-down / drag gesture to dismiss
 * - Explicit visible close control
 * - Zero inline event handlers
 */

let activeSheetEl = null;
let currentOnClose = null;

function ensureRootContainer() {
  let root = document.getElementById('iit-bottom-sheet-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'iit-bottom-sheet-root';
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Opens a bottom sheet with given title, subtitle, and HTML content.
 *
 * @param {Object} options
 * @param {string} options.title - Header title
 * @param {string} [options.subtitle] - Header secondary subtitle
 * @param {string} options.contentHtml - Sanitized inner HTML
 * @param {Function} [options.onClose] - Callback when dismissed
 * @param {Function} [options.onAction] - Optional action callback
 */
export function openBottomSheet({ title, subtitle = '', contentHtml, onClose = null, onAction = null } = {}) {
  closeBottomSheet(); // Close any currently open sheet cleanly

  const root = ensureRootContainer();
  currentOnClose = onClose;

  const backdrop = document.createElement('div');
  backdrop.className = 'iit-bottom-sheet-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'bottom-sheet-heading');

  const container = document.createElement('div');
  container.className = 'iit-bottom-sheet-container';

  // Drag handle for swipe gesture
  const dragHandle = document.createElement('div');
  dragHandle.className = 'bottom-sheet-drag-handle';
  dragHandle.setAttribute('aria-hidden', 'true');

  // Header
  const header = document.createElement('div');
  header.className = 'bottom-sheet-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'bottom-sheet-title-group';

  const h3 = document.createElement('h3');
  h3.id = 'bottom-sheet-heading';
  h3.textContent = title || 'Details';
  titleGroup.appendChild(h3);

  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'sheet-sub';
    sub.textContent = subtitle;
    titleGroup.appendChild(sub);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'bottom-sheet-close-btn';
  closeBtn.setAttribute('aria-label', 'Close details sheet');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => closeBottomSheet());

  header.appendChild(titleGroup);
  header.appendChild(closeBtn);

  // Body content
  const body = document.createElement('div');
  body.className = 'bottom-sheet-body';
  body.innerHTML = contentHtml || '<p>No additional details available.</p>';

  container.appendChild(dragHandle);
  container.appendChild(header);
  container.appendChild(body);
  backdrop.appendChild(container);

  // Click on backdrop (outside container) closes
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeBottomSheet();
    }
  });

  // Keyboard Escape listener
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      closeBottomSheet();
    }
  };
  window.addEventListener('keydown', keyHandler);
  backdrop._keyHandler = keyHandler;

  // Touch / Drag Gesture to close
  let startY = 0;
  let currentTranslateY = 0;
  let isDragging = false;

  const onPointerDown = (e) => {
    startY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    isDragging = true;
    container.style.transition = 'none';
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    const deltaY = y - startY;
    if (deltaY > 0) {
      currentTranslateY = deltaY;
      container.style.transform = `translateY(${deltaY}px)`;
    }
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    container.style.transition = 'transform 0.25s cubic-bezier(0.32, 1, 0.23, 1)';
    if (currentTranslateY > 120) {
      closeBottomSheet();
    } else {
      container.style.transform = 'translateY(0)';
    }
    currentTranslateY = 0;
  };

  dragHandle.addEventListener('pointerdown', onPointerDown);
  header.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  backdrop._cleanupDrag = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  // Wire any interactive buttons inside body
  if (typeof onAction === 'function') {
    body.querySelectorAll('[data-sheet-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const act = btn.getAttribute('data-sheet-action');
        onAction(act, ev);
      });
    });
  }

  root.appendChild(backdrop);
  activeSheetEl = backdrop;

  // Trigger CSS transition
  requestAnimationFrame(() => {
    backdrop.classList.add('active');
    closeBtn.focus();
  });

  return backdrop;
}

/**
 * Closes the active bottom sheet if present.
 */
export function closeBottomSheet() {
  if (!activeSheetEl) return;

  const sheet = activeSheetEl;
  activeSheetEl = null;

  sheet.classList.remove('active');
  if (sheet._keyHandler) {
    window.removeEventListener('keydown', sheet._keyHandler);
  }
  if (sheet._cleanupDrag) {
    sheet._cleanupDrag();
  }

  setTimeout(() => {
    if (sheet.parentNode) {
      sheet.parentNode.removeChild(sheet);
    }
    if (typeof currentOnClose === 'function') {
      currentOnClose();
      currentOnClose = null;
    }
  }, 300);
}

// Global hook for easy accessibility across modules
if (typeof window !== 'undefined') {
  window.openBottomSheet = openBottomSheet;
  window.closeBottomSheet = closeBottomSheet;
}
