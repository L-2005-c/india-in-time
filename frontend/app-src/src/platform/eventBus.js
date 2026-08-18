/**
 * Lightweight app event bus — decouple UI modules without a heavy framework.
 */
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) {
      console.warn('[eventBus]', event, e);
    }
  }
}

export function once(event, fn) {
  const wrap = (payload) => {
    off(event, wrap);
    fn(payload);
  };
  return on(event, wrap);
}
