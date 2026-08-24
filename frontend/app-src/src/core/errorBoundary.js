/**
 * Global error boundary and error handling
 * Catches uncaught exceptions and displays graceful fallback UI
 */

import { captureException } from '@/services/client-observability';

const errorHandlers = new Set();
let lastError = null;

/**
 * Register an error handler
 */
export function onError(handler) {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

/**
 * Handle an error with notification and recovery
 */
export function handleError(error, context = {}) {
  lastError = error;
  
  console.error('[ErrorBoundary] Error captured:', error, context);
  
  // Track in Sentry
  captureException(error, context);
  
  // Notify all error handlers
  errorHandlers.forEach(handler => {
    try {
      handler(error, context);
    } catch (err) {
      console.error('[ErrorBoundary] Error in handler:', err);
    }
  });
}

/**
 * Get last error
 */
export function getLastError() {
  return lastError;
}

/**
 * Clear last error
 */
export function clearError() {
  lastError = null;
}

/**
 * Create error UI element
 */
export function createErrorUI(error, retryFn) {
  const container = document.createElement('div');
  container.className = 'error-boundary';
  container.innerHTML = `
    <div class="error-boundary-content">
      <h2>Something went wrong</h2>
      <p>${escapeHtml(error.message)}</p>
      ${retryFn ? '<button class="error-boundary-retry">Try again</button>' : ''}
      <details>
        <summary>Error details</summary>
        <pre>${escapeHtml(error.stack || error.toString())}</pre>
      </details>
    </div>
  `;
  
  if (retryFn) {
    container.querySelector('.error-boundary-retry').addEventListener('click', () => {
      container.remove();
      retryFn();
    });
  }
  
  return container;
}

/**
 * Escape HTML to prevent XSS in error messages
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize global error handling
 */
export function initializeErrorBoundary() {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    handleError(event.error, {
      type: 'uncaught_error',
      filename: event.filename,
      lineno: event.lineno,
    });
  });
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    handleError(event.reason, {
      type: 'unhandled_rejection',
    });
  });
  
  console.debug('[ErrorBoundary] Initialized');
}
