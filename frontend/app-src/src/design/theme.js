import { tokens } from './tokens.js';

/**
 * Injects token variables into the DOM root and manages theme switching.
 */
export function initializeThemeSystem() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Set Core Neutral & Brand CSS Variables
  Object.entries(tokens.colors.neutral).forEach(([key, val]) => {
    root.style.setProperty(`--color-neutral-${key}`, val);
  });
  Object.entries(tokens.colors.brand).forEach(([key, val]) => {
    root.style.setProperty(`--color-brand-${key}`, val);
  });

  // Set Spacing Variables
  Object.entries(tokens.spacing).forEach(([key, val]) => {
    root.style.setProperty(`--space-${key}`, val);
  });

  // Set Radii & Motion Variables
  Object.entries(tokens.radii).forEach(([key, val]) => {
    root.style.setProperty(`--radius-${key}`, val);
  });
  Object.entries(tokens.motion).forEach(([key, val]) => {
    root.style.setProperty(`--motion-${key}`, val);
  });

  const savedTheme = localStorage.getItem('iit_theme_mode') || 'dark';
  setTheme(savedTheme);
}

export function setTheme(mode) {
  if (typeof document === 'undefined') return;
  const validMode = mode === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', validMode);
  try {
    localStorage.setItem('iit_theme_mode', validMode);
  } catch (_e) {}
}
