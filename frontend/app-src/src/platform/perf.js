/**
 * Lightweight performance marks for key user journeys.
 */
export function mark(name) {
  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`iit:${name}`);
    }
  } catch (_e) {}
}

export function measure(name, startMark, endMark) {
  try {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(`iit:${name}`, `iit:${startMark}`, `iit:${endMark}`);
      const entries = performance.getEntriesByName(`iit:${name}`);
      const last = entries[entries.length - 1];
      return last ? last.duration : null;
    }
  } catch (_e) {}
  return null;
}

export function reportNavigationTiming() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (!nav) return null;
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
    };
  } catch (_e) {
    return null;
  }
}
