/**
 * React Query-style hooks for data fetching with caching and retry logic
 * Provides useQuery and useMutation utilities
 */

import { api } from '@/services/api-client';
import { captureException } from '@/services/client-observability';

const queryCache = new Map();
const queryListeners = new Map();

/**
 * Hook for data fetching with caching and retry
 * @param {string|string[]} queryKey - Cache key for the query
 * @param {Function} queryFn - Async function that fetches data
 * @param {Object} options - Query options
 * @param {boolean} [options.enabled=true] - Enable/disable query
 * @param {number|boolean} [options.retry=3] - Number of retries
 * @param {number} [options.retryDelay=1000] - Delay between retries in ms
 * @param {number} [options.staleTime=300000] - Time before data is considered stale
 * @param {number} [options.cacheTime=600000] - Time to keep data in cache
 * @param {Function} [options.onError] - Error callback
 * @param {Function} [options.onSuccess] - Success callback
 * @returns {Object} Query result with data, loading, error states
 */
export function useQuery(queryKey, queryFn, options = {}) {
  const {
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 10 * 60 * 1000, // 10 minutes
    onError,
    onSuccess,
  } = options;
  
  const key = Array.isArray(queryKey) ? queryKey.join('|') : queryKey;
  const stateHolder = {
    data: undefined,
    isLoading: enabled,
    isError: false,
    error: null,
    lastUpdated: 0,
  };
  
  let mounted = true;
  
  const fetchData = async (attempt = 0) => {
    if (!enabled) return;
    
    try {
      // Check cache
      const cached = queryCache.get(key);
      if (cached && Date.now() - cached.timestamp < staleTime) {
        Object.assign(stateHolder, {
          data: cached.data,
          isLoading: false,
          isError: false,
          error: null,
        });
        onSuccess?.(cached.data);
        return cached.data;
      }
      
      Object.assign(stateHolder, { isLoading: true, isError: false, error: null });
      
      const result = await queryFn();
      
      if (!mounted) return;
      
      // Cache result
      queryCache.set(key, { data: result, timestamp: Date.now() });
      Object.assign(stateHolder, { data: result, isLoading: false, isError: false });
      onSuccess?.(result);
      notifyListeners(key);
      
      return result;
    } catch (err) {
      if (!mounted) return;
      
      // Retry logic
      if (retry !== false && attempt < (typeof retry === 'number' ? retry : 3)) {
        const delay = typeof retryDelay === 'number'
          ? retryDelay * Math.pow(2, attempt)
          : retryDelay * Math.pow(2, attempt);
        
        setTimeout(() => fetchData(attempt + 1), delay);
        return;
      }
      
      Object.assign(stateHolder, {
        isLoading: false,
        isError: true,
        error: err,
      });
      onError?.(err);
      captureException(err, { queryKey: key });
    }
  };
  
  // Subscribe to updates
  const unsubscribe = subscribeToQuery(key, fetchData);
  
  // Initial fetch
  fetchData();
  
  return {
    ...stateHolder,
    refetch: () => fetchData(),
    unsubscribe: () => {
      mounted = false;
      unsubscribe();
    },
  };
}

/**
 * Hook for mutations (POST, PUT, DELETE)
 * @param {Function} mutationFn - Async function to execute
 * @param {Object} options - Mutation options
 * @param {Function} [options.onError] - Error callback
 * @param {Function} [options.onSuccess] - Success callback
 * @returns {Object} Mutation result with mutate function
 */
export function useMutation(mutationFn, options = {}) {
  const { onError, onSuccess } = options;
  
  const stateHolder = {
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  };
  
  const mutate = async (...args) => {
    try {
      Object.assign(stateHolder, { isLoading: true, isError: false, error: null });
      const result = await mutationFn(...args);
      Object.assign(stateHolder, { data: result, isLoading: false, isError: false });
      onSuccess?.(result);
      return result;
    } catch (err) {
      Object.assign(stateHolder, { isLoading: false, isError: true, error: err });
      onError?.(err);
      captureException(err, { mutation: mutationFn.name });
      throw err;
    }
  };
  
  return {
    ...stateHolder,
    mutate,
    mutateAsync: mutate,
    reset: () => Object.assign(stateHolder, {
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    }),
  };
}

/**
 * Subscribe to query updates
 */
function subscribeToQuery(key, callback) {
  if (!queryListeners.has(key)) {
    queryListeners.set(key, new Set());
  }
  queryListeners.get(key).add(callback);
  
  return () => {
    queryListeners.get(key).delete(callback);
  };
}

/**
 * Notify all listeners of a query
 */
function notifyListeners(key) {
  const listeners = queryListeners.get(key);
  if (listeners) {
    listeners.forEach(listener => listener());
  }
}

/**
 * Invalidate query cache
 */
export function invalidateQuery(queryKey) {
  const key = Array.isArray(queryKey) ? queryKey.join('|') : queryKey;
  queryCache.delete(key);
  notifyListeners(key);
}

/**
 * Clear all query cache
 */
export function clearQueryCache() {
  queryCache.clear();
  queryListeners.clear();
}
