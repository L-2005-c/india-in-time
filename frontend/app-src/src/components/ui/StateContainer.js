/**
 * Universal Asynchronous UI State Container (Loading / Empty / Error / Success)
 */
export function renderStateContainer(opts = {}) {
  const box = document.createElement('div');
  box.className = `iit-state-container iit-state-container--${opts.state || 'empty'} ${opts.className || ''}`.trim();

  switch (opts.state) {
    case 'loading':
      box.innerHTML = `
        <div class="iit-state__loader">
          <div class="iit-spinner" aria-label="Loading content"></div>
          <p class="iit-state__txt">${opts.loadingMessage || 'Loading intelligence...'}</p>
        </div>
      `;
      break;

    case 'empty':
      box.innerHTML = `
        <div class="iit-state__empty">
          <div class="iit-state__icon" aria-hidden="true">${opts.emptyIcon || '🗺️'}</div>
          <h4 class="iit-state__title">${opts.emptyTitle || 'No Stops Planned Yet'}</h4>
          <p class="iit-state__subtitle">${opts.emptySubtitle || 'Select preferences and tap Generate to create your itinerary.'}</p>
        </div>
      `;
      break;

    case 'error':
      box.innerHTML = `
        <div class="iit-state__error">
          <div class="iit-state__icon" aria-hidden="true">⚠️</div>
          <h4 class="iit-state__title">${opts.errorTitle || 'Unable to Load Route'}</h4>
          <p class="iit-state__subtitle">${opts.errorMessage || 'An error occurred while loading. Please try again.'}</p>
          ${opts.onRetry ? '<button type="button" class="iit-btn iit-btn--secondary iit-btn--sm iit-retry-btn">Retry</button>' : ''}
        </div>
      `;
      if (opts.onRetry) {
        box.querySelector('.iit-retry-btn')?.addEventListener('click', opts.onRetry);
      }
      break;

    case 'success':
      if (opts.successContent instanceof HTMLElement) {
        box.appendChild(opts.successContent);
      } else {
        box.innerHTML = opts.successContent || '';
      }
      break;
  }

  return box;
}
