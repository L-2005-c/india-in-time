import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // jsdom environment for DOM testing (equivalent to jest's jsdom)
    environment: 'jsdom',
    // Enable global test utilities (describe, it, expect, beforeEach, etc.)
    globals: true,
    // Coverage thresholds matching backend (70% minimum)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
      exclude: [
        'node_modules/',
        'frontend/app-src/src/__tests__/fixtures',
        'dist/',
        'coverage/',
      ],
    },
    include: ['src/**/*.{test,spec}.js'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    // Setup files for test utilities
    setupFiles: ['./src/__tests__/setup.js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@state': path.resolve(__dirname, './src/state'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },
});
