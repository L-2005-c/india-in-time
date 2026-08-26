/**
 * Elevated Card Primitive Component Factory
 */
export function createCard(opts = {}) {
  const card = document.createElement('div');
  card.className = `iit-card ${opts.elevated ? 'iit-card--elevated' : ''} ${opts.interactive ? 'iit-card--interactive' : ''} ${opts.className || ''}`.trim();

  if (opts.headerHtml) {
    const header = document.createElement('div');
    header.className = 'iit-card__header';
    header.innerHTML = opts.headerHtml;
    card.appendChild(header);
  }

  if (opts.bodyHtml) {
    const body = document.createElement('div');
    body.className = 'iit-card__body';
    body.innerHTML = opts.bodyHtml;
    card.appendChild(body);
  }

  if (opts.footerHtml) {
    const footer = document.createElement('div');
    footer.className = 'iit-card__footer';
    footer.innerHTML = opts.footerHtml;
    card.appendChild(footer);
  }

  if (typeof opts.onClick === 'function') {
    card.addEventListener('click', opts.onClick);
  }

  return card;
}
