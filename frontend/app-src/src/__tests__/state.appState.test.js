import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState } from '@/state/appState';

describe('appState', () => {
  beforeEach(() => {
    appState.resetState();
    localStorage.clear();
  });
  
  afterEach(() => {
    appState.resetState();
  });
  
  describe('getState', () => {
    it('returns current state', () => {
      const state = appState.getState();
      expect(state).toBeDefined();
      expect(state.currentCityId).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
    
    it('returns a copy, not a reference', () => {
      const state1 = appState.getState();
      const state2 = appState.getState();
      expect(state1).not.toBe(state2);
    });
  });
  
  describe('setState', () => {
    it('updates state', () => {
      appState.setState({ currentCityId: 'mumbai' });
      expect(appState.getState().currentCityId).toBe('mumbai');
    });
    
    it('merges with existing state', () => {
      appState.setState({ currentCityId: 'mumbai' });
      appState.setState({ preferences: { theme: 'dark' } });
      const state = appState.getState();
      expect(state.currentCityId).toBe('mumbai');
      expect(state.preferences.theme).toBe('dark');
    });
  });
  
  describe('subscribe', () => {
    it('notifies listeners on state change', () => {
      const listener = expect.fn();
      appState.subscribe(listener);
      appState.setState({ currentCityId: 'delhi' });
      expect(listener).toHaveBeenCalled();
    });
    
    it('returns unsubscribe function', () => {
      const listener = expect.fn();
      const unsubscribe = appState.subscribe(listener);
      appState.setState({ currentCityId: 'mumbai' });
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      appState.setState({ currentCityId: 'delhi' });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('resetState', () => {
    it('resets to initial state', () => {
      appState.setState({ currentCityId: 'mumbai', isAuthenticated: true });
      appState.resetState();
      const state = appState.getState();
      expect(state.currentCityId).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
  
  describe('selectors', () => {
    it('provides helper selectors', () => {
      appState.setState({ isAuthenticated: true });
      expect(appState.selectors.isAuthenticated()).toBe(true);
    });
  });
});
