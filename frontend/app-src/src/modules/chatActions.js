/**
 * Chat / feedback action registry — extracted for modular ownership.
 * core/app.js still registers the concrete handlers; this module owns the table shape.
 */
export function createActionTable() {
  return Object.create(null);
}

export function registerActions(table, entries) {
  Object.assign(table, entries);
  return table;
}

export function dispatchAction(table, actionName, btn) {
  const fn = table[actionName];
  if (typeof fn === 'function') {
    fn(btn);
    return true;
  }
  return false;
}
