// Entry point — Vite's module graph starts here. All the actual app logic
// lives in ./core/app.js (still large — see MIGRATION.md for the plan to
// split it further); this file just exists so main.js is the one thing
// index.html has to reference.
import './core/app.js';
