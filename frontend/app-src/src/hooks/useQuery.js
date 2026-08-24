/**
 * React Query-style hooks for data fetching with caching and retry logic
 * Provides useQuery and useMutation utilities
 */

import { api } from '@/services/api-client';
import { captureException } from '@/services/client-observability';

const queryCache = new Map();
const queryListeners = new Map();

interface UseQueryOptions {
  enabled?: boolean;
  retry?: number | boolean;
  retryDelay?: number;
  staleTime?: number; // milliseconds
  cacheTime?: number; // milliseconds
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

interface UseQueryResult {
  data?: any;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  refetch: () => Promise<any>;
}

/**
 * Hook for data fetching with caching and retry
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
  const [data, setData] = (function() {
    const state = {
      data: undefined,
      isLoading: enabled,
      isError: false,
      error: null,
      lastUpdated: 0,
    };
    return [state, (updates) => Object.assign(state, updates)];
  })();
  
  let mounted = true;
  
  const fetchData = async (attempt = 0) => {
    if (!enabled) return;
    
    try {
      // Check cache
      const cached = queryCache.get(key);
      if (cached && Date.now() - cached.timestamp < staleTime) {
        setData({
          data: cached.data,
          isLoading: false,
          isError: false,
          error: null,
        });
        onSuccess?.(cached.data);
        return cached.data;
      }
      
      setData({ isLoading: true, isError: false, error: null });
      
      const result = await queryFn();
      
      if (!mounted) return;
      
      // Cache result
      queryCache.set(key, { data: result, timestamp: Date.now() });
      setData({ data: result, isLoading: false, isError: false });
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
      
      setData({
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
    ...data,
    refetch: () => fetchData(),
    unsubscribe: () => {
      mounted = false;
      unsubscribe();
    },
  };
}

/**
 * Hook for mutations (POST, PUT, DELETE)
 */
export function useMutation(mutationFn, options = {}) {
  const { onError, onSuccess } = options;
  
  const [state, setState] = (function() {
    const s = {
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    };
    return [s, (updates) => Object.assign(s, updates)];
  })();
  
  const mutate = async (...args) => {
    try {
      setState({ isLoading: true, isError: false, error: null });
      const result = await mutationFn(...args);
      setState({ data: result, isLoading: false, isError: false });
      onSuccess?.(result);
      return result;
    } catch (err) {
      setState({ isLoading: false, isError: true, error: err });
      onError?.(err);
      captureException(err, { mutation: mutationFn.name });
      throw err;
    }
  };
  
  return {
    ...state,
    mutate,
    mutateAsync: mutate,
    reset: () => setState({
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
