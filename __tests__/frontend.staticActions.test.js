// __tests__/frontend.staticActions.test.js
//
// Part of converting index.html's (and admin-feedback.html's) inline
// onclick=/onkeydown=/onchange=/oninput= attributes to a data-action
// delegation pattern. Dynamically generated HTML in app.js has also been
// converted to data-action — CSP script-src-attr is now 'none' (see
// middleware/security.js). This suite proves the static HTML side of the
// contract and that STATIC_ACTIONS / CHAT_ACTIONS stay in sync with
// index.html references.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX_HTML_PATH = path.join(__dirname, '../frontend/app-src/index.html');
const APP_JS_PATH = path.join(__dirname, '../frontend/app-src/src/core/app.js');
const ADMIN_HTML_PATH = path.join(__dirname, '../frontend/public/admin-feedback.html');
const ADMIN_JS_PATH = path.join(__dirname, '../frontend/public/admin-feedback.js');

const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
const adminJs = fs.readFileSync(ADMIN_JS_PATH, 'utf8');
const adminHtml = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');

describe('index.html — no inline event handler attributes remain', () => {
  test('zero onclick=/onkeydown=/onchange=/oninput= attributes', () => {
    // Deliberately checks for the attribute pattern (name="), not a bare
    // substring, so this can't false-positive on something like a comment
    // that happens to contain the word "onclick".
    const matches = indexHtml.match(/\bon(click|keydown|change|input)="/g) || [];
    expect(matches).toEqual([]);
  });

  test('every element that has data-view/data-idx/data-arg also has data-action (no orphaned argument attributes)', () => {
    const dom = new JSDOM(indexHtml);
    const doc = dom.window.document;
    for (const attr of ['data-view', 'data-idx', 'data-arg']) {
      const orphans = [...doc.querySelectorAll(`[${attr}]:not([data-action])`)];
      expect(orphans).toHaveLength(0);
    }
  });
});

describe('index.html data-action values <-> app.js dispatch tables — real-file cross-check', () => {
  function extractHtmlActions(html) {
    const dom = new JSDOM(html);
    const els = [...dom.window.document.querySelectorAll('[data-action]')];
    return new Set(els.map(el => el.getAttribute('data-action')));
  }

  function splitTopLevelCommas(line) {
    // Splits only on commas NOT inside (), {}, or [] — needed because table
    // entries like `switchToView: (btn) => switchToView(btn.dataset.view,
    // Number(btn.dataset.idx))` contain commas inside the function body
    // that are not additional table keys.
    const parts = [];
    let depth = 0, current = '';
    for (const ch of line) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  function extractTableKeys(js, tableName) {
    // Finds the object literal holding TABLE_NAME's entries and pulls out
    // its keys. Handles both `fnName,` (bare shorthand) and
    // `fnName: (...) => ...` forms, including several comma-separated bare
    // names on the same line — deliberately simple/regex-based rather than
    // a full JS parser.
    //
    // Two shapes are supported, since app.js uses both:
    //   1. `const TABLE_NAME = { ... };`                (STATIC_ACTIONS)
    //   2. `const TABLE_NAME = Object.create(null);`
    //      ... later ...
    //      `Object.assign(TABLE_NAME, { ... });`         (CHAT_ACTIONS — a
    //      null-prototype object populated after its handler functions are
    //      defined, so it can't accidentally pick up Object.prototype
    //      members and doesn't capture `undefined` if a bundler reorders
    //      const vs function declarations).
    const directLiteral = js.match(new RegExp(`const ${tableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
    const viaAssign = js.match(new RegExp(`Object\\.assign\\(${tableName},\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\);`));
    const tableMatch = directLiteral || viaAssign;
    if (!tableMatch) throw new Error(`Could not find ${tableName} in app.js — did it get renamed/restructured?`);
    const body = tableMatch[1];
    const keys = new Set();
    // Depth is tracked CUMULATIVELY across the whole body, not reset per
    // line — several entries (e.g. `drawerRun: (btn) => { ...multi-line
    // function body..., }`) span multiple lines with their own nested
    // `{ }`/`( )`. Only lines where the entry itself starts (depth is 0
    // *before* the line, i.e. we're directly inside the outer object, not
    // inside one of those nested function bodies) can contain a real
    // top-level key — otherwise a bare statement like `const id = ...` or
    // `if (el) el.click();` inside a nested body gets misread as a
    // shorthand key named "const" or "if".
    let depth = 0;
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      const depthBeforeLine = depth;
      // Update running depth for every line so later lines see accurate
      // nesting, regardless of whether this line's keys get extracted.
      for (const ch of line) {
        if ('([{'.includes(ch)) depth++;
        if (')]}'.includes(ch)) depth--;
      }
      if (!line || line.startsWith('//') || depthBeforeLine > 0) continue;
      for (const segment of splitTopLevelCommas(line)) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const keyMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:?/);
        if (keyMatch) keys.add(keyMatch[1]);
      }
    }
    return keys;
  }

  // switchCity and onTimeSliderChange are dispatched via their own
  // dedicated 'change'/'input' listeners (see app.js, right after the
  // click/keydown delegation) rather than through STATIC_ACTIONS — they
  // need the live el.value at the moment the event fires, unlike the
  // click-based actions which just receive the element itself. Legitimate
  // by design, not a gap in STATIC_ACTIONS.
  const DEDICATED_LISTENER_ACTIONS = new Set(['switchCity', 'onTimeSliderChange']);

  const htmlActions = extractHtmlActions(indexHtml);
  const staticActionKeys = extractTableKeys(appJs, 'STATIC_ACTIONS');
  const chatActionKeys = extractTableKeys(appJs, 'CHAT_ACTIONS');

  test('sanity: extraction actually found a non-trivial number of entries on both sides', () => {
    // Guards against the regexes above silently matching nothing (e.g. if
    // app.js's formatting changes) and every other test in this describe
    // block passing vacuously.
    expect(htmlActions.size).toBeGreaterThan(30);
    expect(staticActionKeys.size).toBeGreaterThan(30);
  });

  test('every data-action referenced in index.html has a matching entry in STATIC_ACTIONS, CHAT_ACTIONS, or a dedicated listener', () => {
    const combined = new Set([...staticActionKeys, ...chatActionKeys, ...DEDICATED_LISTENER_ACTIONS]);
    const missing = [...htmlActions].filter(a => !combined.has(a));
    expect(missing).toEqual([]);
  });

  test('STATIC_ACTIONS and CHAT_ACTIONS key sets are disjoint (no silently-shadowed action name)', () => {
    const overlap = [...staticActionKeys].filter(k => chatActionKeys.has(k));
    expect(overlap).toEqual([]);
  });

  test('every STATIC_ACTIONS entry is referenced in index.html OR in app.js data-action templates (no pure dead entries)', () => {
    const htmlActions = extractHtmlActions(indexHtml);
    // Actions used only in dynamically generated HTML (app.js templates)
    const dynamicOnly = new Set([
      'renderToolsHome', 'renderLingo', 'renderSafety', 'renderBudget', 'renderPassport',
      'prepGuide', 'postcard', 'getInstaSpots', 'getSouvenirGuide', 'showTripRating',
      'showReplanner', 'showWeatherAlerts', 'generateTripPDF', 'setupNotifications',
      'showFestivalRadar', 'showHiddenGems', 'showHartaalAlert', 'showCrowdPredictor',
      'showFareNegotiator', 'showTripTribe', 'shareEmergency', 'addExpense', 'analyzeBudget',
      'delExp', 'delPlan', 'loadPlan', 'loadCloudPlan', 'speak', 'chatAbout', 'aiFoodCard',
      'clickFileInput', 'drawerRun', 'drawerFile', 'shareWhatsAppPass', 'printPass',
    ]);
    const unused = [...staticActionKeys].filter(
      (k) => !htmlActions.has(k) && !dynamicOnly.has(k) && !appJs.includes(`data-action="${k}"`)
    );
    expect(unused).toEqual([]);
  });
});

describe('app.js dispatch pattern — behavioral verification via jsdom', () => {
  // app.js itself can't be loaded whole here — it's an ES module with
  // top-level `import` from live https://www.gstatic.com/... Firebase SDK
  // URLs and an immediate initializeApp() call, neither of which work
  // in an offline jsdom environment. This instead re-creates the exact
  // delegation logic (copied verbatim from app.js's own
  // `document.addEventListener('click', ...)` block below) wired up
  // against mock stand-ins for the real business-logic functions, to
  // verify the DISPATCH PATTERN ITSELF is sound: right function, right
  // arguments, from the right data-* attributes.
  let dom, document, calls;

  beforeEach(() => {
    dom = new JSDOM(`
      <button data-action="goBack">Back</button>
      <button data-action="switchToView" data-view="map-view" data-idx="0">Map</button>
      <button data-action="selectAllCustomPlaces" data-arg="true">Select all</button>
      <button data-action="selectAllCustomPlaces" data-arg="false">Deselect all</button>
      <button class="btn-google" data-action="signInWithGoogle">Sign in</button>
      <div role="button" tabindex="0" data-action="switchToView" data-view="tools-view" data-idx="3">Tools</div>
      <button data-action="unknownAction">Nothing should happen</button>
    `);
    document = dom.window.document;
    calls = [];

    const STATIC_ACTIONS = {
      goBack: () => calls.push(['goBack']),
      switchToView: (btn) => calls.push(['switchToView', btn.dataset.view, Number(btn.dataset.idx)]),
      selectAllCustomPlaces: (btn) => calls.push(['selectAllCustomPlaces', btn.dataset.arg === 'true']),
      signInWithGoogle: (btn) => calls.push(['signInWithGoogle', btn]),
    };

    // Verbatim copy of the delegation pattern in the canonical Vite frontend
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const fn = STATIC_ACTIONS[btn.dataset.action];
      if (fn) fn(btn);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[role="button"][data-action]');
      if (!el) return;
      const fn = STATIC_ACTIONS[el.dataset.action];
      if (fn) fn(el);
    });
  });

  function click(selector) {
    const el = document.querySelector(selector);
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  }

  test('a plain no-arg action dispatches with no extra arguments', () => {
    click('[data-action="goBack"]');
    expect(calls).toEqual([['goBack']]);
  });

  test('switchToView reads data-view (string) and data-idx (converted to a real number, not a string)', () => {
    click('[data-action="switchToView"]');
    expect(calls).toEqual([['switchToView', 'map-view', 0]]);
    expect(typeof calls[0][2]).toBe('number');
  });

  test('selectAllCustomPlaces converts data-arg="true"/"false" to a real boolean, not the string', () => {
    click('[data-arg="true"]');
    click('[data-arg="false"]');
    expect(calls).toEqual([
      ['selectAllCustomPlaces', true],
      ['selectAllCustomPlaces', false],
    ]);
  });

  test('the clicked element itself is passed through, so signInWithGoogle can read it as event.currentTarget would have', () => {
    click('.btn-google');
    expect(calls[0][0]).toBe('signInWithGoogle');
    expect(calls[0][1].className).toBe('btn-google');
  });

  test('clicking a descendant of a data-action element still resolves to that element (event delegation via closest())', () => {
    document.querySelector('[data-action="goBack"]').innerHTML = '<span>Back</span>';
    document.querySelector('span').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(calls).toEqual([['goBack']]);
  });

  test('an unrecognized data-action value is silently ignored, not thrown', () => {
    expect(() => click('[data-action="unknownAction"]')).not.toThrow();
    expect(calls).toEqual([]);
  });

  test('Enter and Space both activate a role="button" element the same way a click would', () => {
    const el = document.querySelector('[role="button"]');
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(calls).toEqual([
      ['switchToView', 'tools-view', 3],
      ['switchToView', 'tools-view', 3],
    ]);
  });

  test('a keydown on any OTHER key does not trigger the action', () => {
    const el = document.querySelector('[role="button"]');
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(calls).toEqual([]);
  });
});

describe('admin-feedback.html — no inline handlers, and data-action values match ADMIN_ACTIONS', () => {
  test('zero onclick= attributes remain', () => {
    const matches = adminHtml.match(/\bonclick="/g) || [];
    expect(matches).toEqual([]);
  });

  test('every data-action in admin-feedback.html has a matching key in its own ADMIN_ACTIONS table', () => {
    const dom = new JSDOM(adminHtml);
    const htmlActions = new Set(
      [...dom.window.document.querySelectorAll('[data-action]')].map(el => el.getAttribute('data-action'))
    );
    expect(htmlActions.size).toBeGreaterThan(0);

    const tableMatch = adminJs.match(/const ADMIN_ACTIONS\s*=\s*\{([\s\S]*?)\n\};/);
    expect(tableMatch).not.toBeNull();
    const keys = new Set();
    for (const rawLine of tableMatch[1].split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      for (const segment of line.split(',')) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const keyMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:?/);
        if (keyMatch) keys.add(keyMatch[1]);
      }
    }

    const missing = [...htmlActions].filter(a => !keys.has(a));
    expect(missing).toEqual([]);
  });
});
