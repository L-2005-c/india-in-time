// eslint.config.js — Flat config (ESLint 9+/10) for the backend.
// The old frontend (frontend/public/*.js) is intentionally excluded —
// it's plain unbundled browser JS kept only as a rollback safety net
// (see frontend/MIGRATION.md) and isn't the active source of truth.
// frontend/app-src/** IS linted: it's real ES modules (import/export),
// bundled by Vite, and runs in the browser — see the override block
// below for its sourceType/globals.
'use strict';

module.exports = [
  {
    ignores: ['node_modules/**', 'frontend/public/**', 'coverage/**'],
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
    // frontend/app-src/** — Vite-bundled ES modules that run in the browser.
    // Different sourceType (import/export, not require/module.exports) and a
    // browser global environment instead of the backend's Node one.
    files: ['frontend/app-src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        screen: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        matchMedia: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        WebSocket: 'readonly',
        Notification: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // Third-party globals loaded via <script> tags outside the module
        // graph (see MIGRATION.md — client-api.js is deliberately not
        // bundled) or via CDN in index.html.
        DOMPurify: 'readonly',
        L: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        CSS: 'readonly',
      },
    },
  },
  {
    // frontend/app-src/vite.config.js — Node-side ESM (not browser code).
    files: ['frontend/app-src/vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
      },
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
];
