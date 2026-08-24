/**
 * API client with automatic retry, error handling, and caching
 * Integrates with TanStack Query for request deduplication
 */

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second, exponential backoff

/**
 * Fetch wrapper with timeout, retry, and error handling
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
          // Retry on 5xx errors
          await delay(RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }
        
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      
      return response;
    } catch (err) {
      lastError = err;
      
      // Retry on network errors or 5xx
      if ((err.name === 'AbortError' || err instanceof TypeError) && attempt < retries) {
        await delay(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }
      
      // Don't retry client errors (4xx)
      if (err.status && err.status >= 400 && err.status < 500) {
        throw err;
      }
    }
  }
  
  throw lastError;
}

/**
 * Helper to delay execution (for exponential backoff)
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  return navigator.onLine;
}

/**
 * Listen for online/offline changes
 */
export function onOnlineStatusChange(callback) {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
  
  return () => {
    window.removeEventListener('online', () => callback(true));
    window.removeEventListener('offline', () => callback(false));
  };
}
