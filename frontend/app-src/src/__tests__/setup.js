/* global global */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/dom';

// Cleanup DOM after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia for responsive design tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
// eslint-disable-next-line no-undef
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock fetch globally for request tests
// eslint-disable-next-line no-undef
global.fetch = vi.fn();

// Suppress console errors in tests (use expect() to verify error handling)
// eslint-disable-next-line no-undef
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
};
