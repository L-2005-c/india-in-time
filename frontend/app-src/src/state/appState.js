/**
 * Centralized application state management using Zustand pattern.
 * Replaces bare `let` variables with a reactive state store.
 * 
 * Usage:
 *   import { appState } from '@/state/appState';
 *   
 *   // Subscribe to changes
 *   const unsubscribe = appState.subscribe((state) => {
 *     console.log('City changed:', state.currentCityId);
 *   });
 *   
 *   // Get current state
 *   const state = appState.getState();
 *   
 *   // Update state
 *   appState.setState({ currentCityId: 'mumbai' });
 */

const listeners = new Set();

const initialState = {
  // Connectivity
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  // Auth
  userId: null,
  userEmail: null,
  isAuthenticated: false,
  authToken: null,
  
  // Navigation
  currentCityId: null,
  currentCity: null,
  
  // Itinerary
  itinerary: [],
  itineraryPlans: [],
  
  // Preferences
  preferences: {
    theme: 'light',
    language: 'en',
    accessibility: {
      highContrast: false,
      reduceMotion: false,
      fontSize: 'normal',
    },
  },
  
  // Trip data
  trips: [],
  currentTrip: null,
  favorites: [],
  expenses: [],
  
  // UI state
  modals: {
    isMapOpen: false,
    isChatOpen: false,
    isBudgetOpen: false,
    isPlannerOpen: false,
  },
  
  // Loading & errors
  isLoading: false,
  error: null,
  notifications: [],
  
  // Cache
  placeCache: {},
  weatherCache: {},
  aiResponseCache: {},

  // Feature Flags
  featureFlags: {},
};

export let state = { ...initialState };

/**
 * Get current state snapshot
 */
export function getState() {
  return { ...state };
}

/**
 * Update state (shallow merge)
 */
export function setState(updates) {
  state = { ...state, ...updates };
  
  // Notify all subscribers of state change
  notifyListeners();
  
  // Persist to localStorage for offline access
  persistState({
    userId: state.userId,
    currentCityId: state.currentCityId,
    preferences: state.preferences,
    favorites: state.favorites,
    trips: state.trips,
  });
}

/**
 * Subscribe to state changes
 */
export function subscribe(listener) {
  listeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all subscribers
 */
function notifyListeners() {
  listeners.forEach(listener => {
    try {
      listener(state);
    } catch (err) {
      console.error('Error in state listener:', err);
    }
  });
}

/**
 * Reset state to initial values
 */
export function resetState() {
  state = { ...initialState };
  notifyListeners();
  localStorage.removeItem('india-in-time:state');
}

/**
 * Persist non-sensitive state to localStorage
 */
function persistState(partial) {
  try {
    const safeState = {
      currentCityId: partial.currentCityId,
      preferences: partial.preferences,
      favorites: partial.favorites,
      trips: partial.trips,
    };
    localStorage.setItem('india-in-time:state', JSON.stringify(safeState));
  } catch (err) {
    console.warn('Failed to persist state:', err.message);
  }
}

/**
 * Restore state from localStorage
 */
export function restoreState() {
  try {
    const saved = localStorage.getItem('india-in-time:state');
    if (saved) {
      const restored = JSON.parse(saved);
      setState(restored);
    }
  } catch (err) {
    console.warn('Failed to restore state:', err.message);
  }
}

/**
 * Selector helpers for common state access patterns
 */
export const selectors = {
  isAuthenticated: () => state.isAuthenticated,
  currentCity: () => state.currentCity,
  currentItinerary: () => state.itinerary,
  currentTrip: () => state.currentTrip,
  hasError: () => state.error !== null,
  getError: () => state.error,
  isLoading: () => state.isLoading,
  getNotifications: () => [...state.notifications],
  getPreferences: () => ({ ...state.preferences }),
};

/**
 * Initialize app state from localStorage and window globals
 */
export function initializeAppState(globals = window) {
  // Restore persisted state
  restoreState();
  
  // Merge any initial data from server (injected in HTML)
  if (globals.__appInitialData) {
    setState(globals.__appInitialData);
  }
  
  // Expose state to window for debugging in dev mode
  if (import.meta.env.DEV) {
    globals.__appState = {
      getState,
      setState,
      subscribe,
      resetState,
      selectors,
    };
  }
}

export function setOnline(isOnline) {
  setState({ isOnline: Boolean(isOnline) });
}

export const appState = {
  getState,
  setState,
  subscribe,
  resetState,
  selectors,
  initializeAppState,
  setOnline,
};
