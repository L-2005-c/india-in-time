# Render Runtime TDZ Fix — v3.8.2

## Production symptom

The Vite production bundle loaded the splash screen and then crashed with:

`Uncaught ReferenceError: Cannot access 'o' before initialization`

This is a minified temporal-dead-zone error.

## Root causes

1. `core/app.js` called `createAuthSession()` and referenced Firebase bindings
   without importing the ES modules that own them.
2. The initial `Object.assign(window, {...})` block referenced the `const`
   authentication functions `signInWithGoogle`, `doSignOut`, and
   `toggleUserMenu` before those bindings were initialized.
3. Several extracted pure helpers were still referenced through deleted
   pre-modularization global names.
4. A stale `gProvider` alias remained after Firebase provider extraction.

## Fix

- Add explicit ES-module imports for Firebase, auth-session, budget, planner,
  scoring, GPS, navigation, sun, badge, and travel-time helpers.
- Move the HTML window bridge below auth-session initialization.
- Replace stale helper names with imported module functions.
- Explicitly declare auth state and the auth-check promise.
- Add a build-time runtime-invariant check.

No backend API, database, Redis, Gemini, or provider contract is changed by
this fix; it is a frontend module-graph/runtime correction.
