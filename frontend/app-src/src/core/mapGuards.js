import { browserLogger } from '../utils/browser-logger.js';
/**
 * Leaflet safety boundary. Map rendering is isolated here so the app core
 * does not carry vendor-specific defensive patches alongside business logic.
 */
export function installLeafletSafetyGuards(Lib = globalThis.L) {
  if (!Lib) return;

  if (!Lib.__coordGuardInstalled) {
    Lib.__coordGuardInstalled = true;
    const isFiniteLatLngPair = value => {
      if (Array.isArray(value)) {
        return value.length >= 2 && Number.isFinite(+value[0]) && Number.isFinite(+value[1]);
      }
      if (value && typeof value === 'object') {
        return Number.isFinite(+value.lat) && Number.isFinite(+(value.lng ?? value.lon));
      }
      return false;
    };
    const noopLayer = () => {
      const stub = {};
      ['addTo','bindPopup','bindTooltip','setLatLng','setStyle','setIcon','setLatLngs','on','off','remove','removeFrom']
        .forEach(method => { stub[method] = () => stub; });
      stub.getBounds = () => (typeof Lib.latLngBounds === 'function' ? Lib.latLngBounds([[20.5937,78.9629],[20.5937,78.9629]]) : { isValid: () => false, getCenter: () => ({ lat: 20.5937, lng: 78.9629 }) });
      stub.getLatLngs = () => [];
      stub.getElement = () => null;
      return stub;
    };

    const originalLatLng = Lib.latLng;
    if (typeof originalLatLng === 'function') {
      Lib.latLng = function latLngGuard(a, b, c) {
        try {
          if (Array.isArray(a)) {
            const lat = +a[0], lng = +a[1];
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return originalLatLng.call(Lib, 20.5937, 78.9629);
            return originalLatLng.call(Lib, lat, lng);
          }
          if (a && typeof a === 'object') {
            const lat = +a.lat, lng = +(a.lng ?? a.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return originalLatLng.call(Lib, 20.5937, 78.9629);
            return originalLatLng.call(Lib, lat, lng);
          }
          const lat = +a, lng = +b;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return originalLatLng.call(Lib, 20.5937, 78.9629);
          }
          return originalLatLng.call(Lib, lat, lng, c);
        } catch (_e) {
          return originalLatLng.call(Lib, 20.5937, 78.9629);
        }
      };
    }

    if (typeof Lib.LatLng === 'function') {
      const OrigLatLng = Lib.LatLng;
      Lib.LatLng = function SafeLatLng(lat, lng, alt) {
        const safeLat = Number.isFinite(+lat) ? +lat : 20.5937;
        const safeLng = Number.isFinite(+lng) ? +lng : 78.9629;
        return new OrigLatLng(safeLat, safeLng, alt);
      };
      Lib.LatLng.prototype = OrigLatLng.prototype;
    }

    if (Lib.Marker && Lib.Marker.prototype) {
      const origSetLatLng = Lib.Marker.prototype.setLatLng;
      Lib.Marker.prototype.setLatLng = function guardedSetLatLng(latlng) {
        if (!isFiniteLatLngPair(latlng)) return this;
        try { return origSetLatLng.call(this, latlng); }
        catch (_err) { return this; }
      };
    }

    const originalMarker = Lib.marker;
    Lib.marker = function markerGuard(coords, options) {
      if (!isFiniteLatLngPair(coords)) {
        browserLogger.warn('[map guard] skipped L.marker — invalid coords:', coords, options?.icon?.options?.className || '');
        return noopLayer();
      }
      return originalMarker.call(Lib, coords, options);
    };

    const originalPolyline = Lib.polyline;
    Lib.polyline = function polylineGuard(latlngs, options) {
      const clean = (Array.isArray(latlngs) ? latlngs : []).filter(isFiniteLatLngPair);
      if (clean.length < 2) {
        browserLogger.warn('[map guard] skipped L.polyline — fewer than 2 valid points out of', (latlngs || []).length);
        return noopLayer();
      }
      if (clean.length !== latlngs.length) {
        browserLogger.warn('[map guard] dropped', latlngs.length - clean.length, 'invalid point(s) from a polyline');
      }
      return originalPolyline.call(Lib, clean, options);
    };

    ['circle', 'circleMarker'].forEach(fn => {
      if (typeof Lib[fn] === 'function') {
        const orig = Lib[fn];
        Lib[fn] = function safeCircle(latlng, options) {
          if (!isFiniteLatLngPair(latlng)) return noopLayer();
          return orig.call(Lib, latlng, options);
        };
      }
    });

    if (typeof Lib.latLngBounds === 'function') {
      const origBounds = Lib.latLngBounds;
      Lib.latLngBounds = function safeLatLngBounds(a, b) {
        try {
          if (Array.isArray(a)) {
            const clean = a.filter(isFiniteLatLngPair);
            if (clean.length === 0) return origBounds.call(Lib, [[20.5937, 78.9629], [20.5937, 78.9629]]);
            return origBounds.call(Lib, clean, b);
          }
          return origBounds.call(Lib, a, b);
        } catch (_e) {
          return origBounds.call(Lib, [[20.5937, 78.9629], [20.5937, 78.9629]]);
        }
      };
    }
  }

  if (!Lib.Map || Lib.Map.prototype.__moveGuardInstalled) return;
  Lib.Map.prototype.__moveGuardInstalled = true;
  const originalSetView = Lib.Map.prototype.setView;

  if (typeof Lib.Map.prototype.distance === 'function') {
    const origDistance = Lib.Map.prototype.distance;
    Lib.Map.prototype.distance = function guardedDistance(latlng1, latlng2) {
      if (!Array.isArray(latlng1) && (!latlng1 || typeof latlng1 !== 'object')) return 0;
      if (!Array.isArray(latlng2) && (!latlng2 || typeof latlng2 !== 'object')) return 0;
      try {
        return origDistance.call(this, latlng1, latlng2);
      } catch (_e) {
        return 0;
      }
    };
  }

  if (typeof Lib.Map.prototype.fitBounds === 'function') {
    const origFitBounds = Lib.Map.prototype.fitBounds;
    Lib.Map.prototype.fitBounds = function guardedFitBounds(bounds, options) {
      try {
        if (!bounds || (typeof bounds.isValid === 'function' && !bounds.isValid())) return this;
        return origFitBounds.call(this, bounds, options);
      } catch (_e) {
        return this;
      }
    };
  }

  ['flyTo', 'panTo', 'setView'].forEach(methodName => {
    const original = Lib.Map.prototype[methodName];
    if (typeof original !== 'function') return;
    const needsStop = methodName !== 'setView';

    Lib.Map.prototype[methodName] = function guardedMapMove(target, ...rest) {
      const lat = Array.isArray(target) ? target[0] : target?.lat;
      const lng = Array.isArray(target) ? target[1] : (target?.lng ?? target?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        browserLogger.warn(`[map guard] skipped ${methodName} — invalid target:`, target);
        return this;
      }

      if (methodName === 'flyTo') {
        const size = this.getSize ? this.getSize() : null;
        if (!size || !(size.x > 0) || !(size.y > 0)) {
          browserLogger.warn('[map guard] flyTo on a hidden/zero-size map — using instant setView instead');
          return originalSetView.call(this, target, rest[0]);
        }
      }

      if (needsStop) this.stop();
      try {
        return original.call(this, target, ...rest);
      } catch (error) {
        browserLogger.warn(`[map guard] ${methodName} threw, falling back to instant setView`, error);
        try { return originalSetView.call(this, target, rest[0]); }
        catch (fallbackError) {
          browserLogger.warn('[map guard] fallback setView also threw', fallbackError);
          return this;
        }
      }
    };
  });
}

if (typeof window !== 'undefined' && window.L) {
  installLeafletSafetyGuards(window.L);
}
