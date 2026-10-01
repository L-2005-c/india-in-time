import { browserLogger } from '../utils/browser-logger.js';
/**
 * Leaflet safety boundary. Map rendering is isolated here so the app core
 * does not carry vendor-specific defensive patches alongside business logic.
 */
export function installLeafletSafetyGuards(Lib = globalThis.L) {
  if (!Lib) return;

  const cleanLatLngPair = value => {
    if (Array.isArray(value)) {
      if (value.length < 2) return null;
      let lat = +value[0], lng = +value[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Invert if passed as [longitude, latitude] in India (lat in 68-98, lng in 6-38)
      if (lat >= 68 && lat <= 98 && lng >= 6 && lng <= 38) {
        const tmp = lat; lat = lng; lng = tmp;
      }
      return [lat, lng];
    }
    if (value && typeof value === 'object') {
      let lat = +value.lat, lng = +(value.lng ?? value.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat >= 68 && lat <= 98 && lng >= 6 && lng <= 38) {
        const tmp = lat; lat = lng; lng = tmp;
      }
      return [lat, lng];
    }
    return null;
  };

  if (!Lib.__coordGuardInstalled) {
    Lib.__coordGuardInstalled = true;
    const isFiniteLatLngPair = value => Boolean(cleanLatLngPair(value));
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
          if (Array.isArray(a) || (a && typeof a === 'object')) {
            const cleaned = cleanLatLngPair(a);
            if (!cleaned) return originalLatLng.call(Lib, 20.5937, 78.9629);
            return originalLatLng.call(Lib, cleaned[0], cleaned[1]);
          }
          let lat = +a, lng = +b;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return originalLatLng.call(Lib, 20.5937, 78.9629);
          }
          if (lat >= 68 && lat <= 98 && lng >= 6 && lng <= 38) {
            const tmp = lat; lat = lng; lng = tmp;
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
        let safeLat = Number.isFinite(+lat) ? +lat : 20.5937;
        let safeLng = Number.isFinite(+lng) ? +lng : 78.9629;
        if (safeLat >= 68 && safeLat <= 98 && safeLng >= 6 && safeLng <= 38) {
          const tmp = safeLat; safeLat = safeLng; safeLng = tmp;
        }
        return new OrigLatLng(safeLat, safeLng, alt);
      };
      Lib.LatLng.prototype = OrigLatLng.prototype;
    }

    if (Lib.Marker && Lib.Marker.prototype) {
      const origSetLatLng = Lib.Marker.prototype.setLatLng;
      Lib.Marker.prototype.setLatLng = function guardedSetLatLng(latlng) {
        const cleaned = cleanLatLngPair(latlng);
        if (!cleaned) return this;
        try { return origSetLatLng.call(this, cleaned); }
        catch (_err) { return this; }
      };
    }

    const originalMarker = Lib.marker;
    Lib.marker = function markerGuard(coords, options) {
      const cleaned = cleanLatLngPair(coords);
      if (!cleaned) {
        browserLogger.warn('[map guard] skipped L.marker — invalid coords:', coords, options?.icon?.options?.className || '');
        return noopLayer();
      }
      return originalMarker.call(Lib, cleaned, options);
    };

    const originalPolyline = Lib.polyline;
    Lib.polyline = function polylineGuard(latlngs, options) {
      const clean = (Array.isArray(latlngs) ? latlngs : []).map(cleanLatLngPair).filter(Boolean);
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
          const cleaned = cleanLatLngPair(latlng);
          if (!cleaned) return noopLayer();
          return orig.call(Lib, cleaned, options);
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
      const cleaned = cleanLatLngPair(target);
      if (!cleaned) {
        browserLogger.warn(`[map guard] skipped ${methodName} — invalid target:`, target);
        return this;
      }
      const safeTarget = cleaned;

      if (methodName === 'flyTo') {
        const size = this.getSize ? this.getSize() : null;
        if (!size || !(size.x > 0) || !(size.y > 0)) {
          browserLogger.warn('[map guard] flyTo on a hidden/zero-size map — using instant setView instead');
          return originalSetView.call(this, safeTarget, rest[0]);
        }
      }

      if (needsStop) this.stop();
      try {
        return original.call(this, safeTarget, ...rest);
      } catch (error) {
        browserLogger.warn(`[map guard] ${methodName} threw, falling back to instant setView`, error);
        try { return originalSetView.call(this, safeTarget, rest[0]); }
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
