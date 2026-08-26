/**
 * Accessible Button Component Factory
 */
export function createButton(opts = {}) {
  const btn = document.createElement('button');
  btn.type = opts.type || 'button';
  btn.className = `iit-btn iit-btn--${opts.variant || 'primary'} iit-btn--${opts.size || 'md'} ${opts.className || ''}`.trim();
  btn.disabled = !!opts.disabled || !!opts.loading;

  if (opts.id) btn.id = opts.id;
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);

  const content = [];
  if (opts.loading) {
    content.push('<span class="iit-btn__spinner" aria-hidden="true">⏳</span>');
  } else if (opts.iconLeading) {
    content.push(`<span class="iit-btn__icon-leading" aria-hidden="true">${opts.iconLeading}</span>`);
  }

  if (opts.label) {
    content.push(`<span class="iit-btn__label">${opts.label}</span>`);
  }

  if (opts.iconTrailing && !opts.loading) {
    content.push(`<span class="iit-btn__icon-trailing" aria-hidden="true">${opts.iconTrailing}</span>`);
  }

  btn.innerHTML = content.join('');

  if (typeof opts.onClick === 'function') {
    btn.addEventListener('click', opts.onClick);
  }

  return btn;
}
