'use strict';
function scrub(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  return value.replace(/AIza[\w-]{20,}/g, '[REDACTED_KEY]');
}
function emit(level, args) {
  const safe = args.map(scrub);
  const fn = globalThis.console?.[level];
  if (typeof fn === 'function') fn(`[IndiaInTime:${level}]`, ...safe);
}
export const browserLogger = {
  log: (...args) => emit('log', args),
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
  debug: (...args) => emit('debug', args),
};
