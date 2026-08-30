/**
 * frontend/app-src/src/services/apiClient.js
 * Authoritative API client with automatic retry, exponential backoff, error handling,
 * and routing endpoint helpers.
 */

import { browserLogger } from '../utils/browser-logger.js';
import { setLastError } from '../state/appState.js';

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second, exponential backoff

export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with timeout, retry, and error normalization
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await delay(RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }
        const error = new ApiError(`HTTP ${response.status}`, 'HTTP_ERROR', response.status, response);
        throw error;
      }

      return response;
    } catch (err) {
      lastError = err;

      if ((err.name === 'AbortError' || err instanceof TypeError) && attempt < retries) {
        await delay(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }

      if (err.status && err.status >= 400 && err.status < 500) {
        setLastError(err);
        browserLogger.warn('[apiClient]', url, err.status, err.message);
        throw err;
      }
    }
  }

  const normalized = lastError instanceof ApiError ? lastError : new ApiError(lastError?.message || String(lastError), 'NETWORK_ERROR', 0, lastError);
  setLastError(normalized);
  browserLogger.warn('[apiClient]', url, normalized.code, normalized.message);
  throw normalized;
}

/**
 * Generic API fetch methods
 */
export const api = {
  get: async (url, options = {}) => {
    const response = await fetchWithRetry(url, { ...options, method: 'GET' });
    return response.json();
  },

  post: async (url, body, options = {}) => {
    const response = await fetchWithRetry(url, {
      ...options,
      method: 'POST',
      body,
    });
    return response.json();
  },

  put: async (url, body, options = {}) => {
    const response = await fetchWithRetry(url, {
      ...options,
      method: 'PUT',
      body,
    });
    return response.json();
  },

  delete: async (url, options = {}) => {
    const response = await fetchWithRetry(url, { ...options, method: 'DELETE' });
    return response.json();
  },
};

/**
 * Check if user is online
 */
export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Listen for online/offline changes
 */
export function onOnlineStatusChange(callback) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));

  return () => {
    window.removeEventListener('online', () => callback(true));
    window.removeEventListener('offline', () => callback(false));
  };
}

/**
 * Fetch authoritative route from backend
 */
export async function fetchRoute(origin, destination, options = {}) {
  const originStr = Array.isArray(origin) ? `${origin[0]},${origin[1]}` : origin;
  const destStr = Array.isArray(destination) ? `${destination[0]},${destination[1]}` : destination;
  const params = new URLSearchParams({
    origin: originStr,
    destination: destStr,
    mode: options.mode || 'driving',
    ...(options.departureTime ? { departureTime: options.departureTime } : {}),
    ...(options.preference ? { preference: options.preference } : {}),
  });
  return api.get(`/api/v1/routing/route?${params.toString()}`);
}

/**
 * Fetch multi-stop itinerary route matrix
 */
export async function fetchRouteMatrix(stops, options = {}) {
  return api.post('/api/v1/routing/matrix', {
    stops,
    mode: options.mode || 'driving',
    departureTime: options.departureTime,
    preference: options.preference,
  });
}

/**
 * Fetch lightweight ETA
 */
export async function fetchEta(origin, destination, options = {}) {
  const originStr = Array.isArray(origin) ? `${origin[0]},${origin[1]}` : origin;
  const destStr = Array.isArray(destination) ? `${destination[0]},${destination[1]}` : destination;
  const params = new URLSearchParams({
    origin: originStr,
    destination: destStr,
    mode: options.mode || 'driving',
    ...(options.departureTime ? { departureTime: options.departureTime } : {}),
  });
  return api.get(`/api/v1/routing/eta?${params.toString()}`);
}
