import { browserLogger } from '../utils/browser-logger.js';
import { setLastError } from '../state/appState.js';
function getAPI() {
  const a = typeof window !== 'undefined' ? window.API : null;
  if (!a) throw new ApiError('API not loaded', 'API_NOT_LOADED', 0);
  return a;
}
export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = 0, details = null) {
    super(message);
    this.name = 'ApiError'; this.code = code; this.status = status; this.details = details;
  }
}
async function withTimeout(promise, ms = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ApiError('Request timed out', 'TIMEOUT', 0)), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer); }
}
export async function apiCall(method, ...args) {
  const api = getAPI();
  const fn = api[method];
  if (typeof fn !== 'function') throw new ApiError(`Unknown API method: ${method}`, 'METHOD_NOT_FOUND', 0);
  try {
    return await withTimeout(fn.apply(api, args));
  } catch (err) {
    const normalized = err instanceof ApiError ? err : new ApiError(err?.message || String(err), err?.code || 'API_ERROR', err?.status || 0, err);
    setLastError(normalized);
    browserLogger.warn('[apiClient]', method, normalized.code, normalized.message);
    throw normalized;
  }
}
export function apiMethod(name) { return (...args) => apiCall(name, ...args); }
