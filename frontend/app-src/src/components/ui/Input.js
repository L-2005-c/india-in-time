/**
 * Accessible Input Component Factory
 */
export function createInput(opts = {}) {
  const container = document.createElement('div');
  container.className = `iit-input-group ${opts.containerClassName || ''}`.trim();

  if (opts.label) {
    const label = document.createElement('label');
    if (opts.id) label.htmlFor = opts.id;
    label.className = 'iit-input-label';
    label.textContent = opts.label + (opts.required ? ' *' : '');
    container.appendChild(label);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'iit-input-wrapper';

  if (opts.icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'iit-input-icon';
    iconEl.textContent = opts.icon;
    wrapper.appendChild(iconEl);
  }

  const input = document.createElement('input');
  if (opts.id) input.id = opts.id;
  input.type = opts.type || 'text';
  input.className = `iit-input ${opts.error ? 'iit-input--error' : ''} ${opts.className || ''}`.trim();
  if (opts.value != null) input.value = opts.value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.required = !!opts.required;
  if (opts.disabled) input.disabled = true;

  if (opts.error) {
    input.setAttribute('aria-invalid', 'true');
    if (opts.id) input.setAttribute('aria-describedby', `${opts.id}-error`);
  }

  if (typeof opts.onChange === 'function') {
    input.addEventListener('input', (e) => opts.onChange(e.target.value));
  }

  wrapper.appendChild(input);
  container.appendChild(wrapper);

  if (opts.error) {
    const err = document.createElement('div');
    if (opts.id) err.id = `${opts.id}-error`;
    err.className = 'iit-input-error';
    err.textContent = opts.error;
    container.appendChild(err);
  } else if (opts.helperText) {
    const helper = document.createElement('div');
    helper.className = 'iit-input-helper';
    helper.textContent = opts.helperText;
    container.appendChild(helper);
  }

  return container;
}
