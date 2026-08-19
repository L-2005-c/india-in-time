// eslint.config.js — Flat config (ESLint 9+/10) for the backend.
// The frontend (frontend/public/*.js) is intentionally excluded for now —
// it's plain unbundled browser JS with a different global environment
// (window, document) and is tracked as a separate cleanup effort.
'use strict';

module.exports = [
  {
    ignores: ['node_modules/**', 'frontend/public/**', 'frontend/public/dist/**', 'coverage/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',
      'no-var': 'warn',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['frontend/app-src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        FileReader: 'readonly',
        CSS: 'readonly',
        ResizeObserver: 'readonly',
        L: 'readonly', // Leaflet, loaded globally via <script> tag in index.html
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        Notification: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        // Never assigned anywhere in this codebase (old or new frontend) —
        // read defensively via `typeof realSunsetMin === 'number'` as a
        // placeholder for a "real" sunset time that could one day be
        // supplied by a weather/astronomy integration. Always falls back
        // to the hardcoded approximate sunset time today; harmless but
        // pre-existing (not introduced by the app-src migration).
        realSunsetMin: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
  {
    // Playwright e2e specs use page.evaluate(() => {...}) callbacks whose
    // function bodies run inside the browser, not Node — so they need
    // browser globals (performance, window, document, etc.) in addition
    // to the Node/CommonJS globals from the base config above.
    files: ['__tests__/e2e/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
      },
    },
  },
];
