/**
 * Status and Categorical Badge Component Factory
 */
export function createBadge(opts = {}) {
  const badge = document.createElement('span');
  badge.className = `iit-badge iit-badge--${opts.variant || 'default'} iit-badge--${opts.size || 'md'} ${opts.className || ''}`.trim();

  const content = [];
  if (opts.icon) {
    content.push(`<span class="iit-badge__icon" aria-hidden="true">${opts.icon}</span>`);
  }
  if (opts.label) {
    content.push(`<span class="iit-badge__label">${opts.label}</span>`);
  }

  badge.innerHTML = content.join('');
  if (opts.title) badge.title = opts.title;

  return badge;
}
