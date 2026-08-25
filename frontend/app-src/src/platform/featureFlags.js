import { getState, setState } from '../state/appState.js';

const defaults = {
  aiEnabled: true,
  timeIntelligenceEnabled: true,
  mlCrowdEnabled: true,
  liveRoutingEnabled: true,
  streetQuest: true,
  multiDayPlanner: true,
  offlineToast: true,
  maintenanceMode: false,
};

export function getFlag(name) {
  const current = getState();
  if (current.featureFlags && Object.prototype.hasOwnProperty.call(current.featureFlags, name)) {
    return !!current.featureFlags[name];
  }
  return Object.prototype.hasOwnProperty.call(defaults, name) ? defaults[name] : false;
}

export function setFlags(flags = {}) {
  const current = getState();
  setState({ featureFlags: { ...defaults, ...(current.featureFlags || {}), ...flags } });
}

export async function hydrateFlagsFromServer() {
  try {
    const res = await fetch('/api/flags/public', { credentials: 'same-origin' });
    if (!res.ok) return getFlag;
    const data = await res.json();
    if (data?.flags) setFlags(data.flags);
  } catch (_e) {}
  return getFlag;
}
