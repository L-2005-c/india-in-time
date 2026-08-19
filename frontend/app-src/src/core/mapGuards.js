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
      stub.getBounds = () => Lib.latLngBounds([[20.5937,78.9629],[20.5937,78.9629]]);
      stub.getLatLngs = () => [];
      stub.getElement = () => null;
      return stub;
    };

    // 0. Guard L.LatLng constructor and L.latLng factory against NaN crashes
    if (Lib.LatLng && !Lib.LatLng.__guarded) {
      const OriginalLatLng = Lib.LatLng;
      function SafeLatLng(lat, lng, alt) {
        let safeLat = +lat;
        let safeLng = +(lng ?? 0);
        if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
          safeLat = 20.5937;
          safeLng = 78.9629;
        }
        return new OriginalLatLng(safeLat, safeLng, alt);
      }
      SafeLatLng.prototype = OriginalLatLng.prototype;
      SafeLatLng.__guarded = true;
      Lib.LatLng = SafeLatLng;
    }

    if (Lib.latLng) {
      const originalLatLngFactory = Lib.latLng;
      Lib.latLng = function safeLatLngFactory(a, b, c) {
        if (a instanceof Lib.LatLng) return a;
        if (Array.isArray(a)) {
          if (!Number.isFinite(+a[0]) || !Number.isFinite(+a[1])) {
            return new Lib.LatLng(20.5937, 78.9629);
          }
        } else if (a && typeof a === 'object') {
          const lat = a.lat;
          const lng = a.lng ?? a.lon;
          if (!Number.isFinite(+lat) || !Number.isFinite(+lng)) {
            return new Lib.LatLng(20.5937, 78.9629);
          }
        } else if (!Number.isFinite(+a) || !Number.isFinite(+b)) {
          return new Lib.LatLng(20.5937, 78.9629);
        }
        return originalLatLngFactory.call(Lib, a, b, c);
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
  }

  if (!Lib.Map || Lib.Map.prototype.__moveGuardInstalled) return;
  Lib.Map.prototype.__moveGuardInstalled = true;
  const originalSetView = Lib.Map.prototype.setView;

  ['flyTo', 'panTo', 'setView', 'panBy'].forEach(methodName => {
    const original = Lib.Map.prototype[methodName];
    if (typeof original !== 'function') return;
    const needsStop = methodName !== 'setView';

    Lib.Map.prototype[methodName] = function guardedMapMove(target, ...rest) {
      if (methodName === 'panBy') {
        const offset = target;
        const x = Array.isArray(offset) ? offset[0] : offset?.x;
        const y = Array.isArray(offset) ? offset[1] : offset?.y;
        if (!Number.isFinite(+x) || !Number.isFinite(+y)) return this;
        return original.call(this, target, ...rest);
      }

      const lat = Array.isArray(target) ? target[0] : target?.lat;
      const lng = Array.isArray(target) ? target[1] : (target?.lng ?? target?.lon);
      if (!Number.isFinite(+lat) || !Number.isFinite(+lng)) {
        browserLogger.warn(`[map guard] skipped ${methodName} — invalid target:`, target);
        return this;
      }

      // Check map container size
      const size = this.getSize ? this.getSize() : null;
      const hasValidSize = size && size.x > 0 && size.y > 0;

      // Validate zoom argument if passed
      let zoom = rest[0];
      if (zoom !== undefined && !Number.isFinite(+zoom)) {
        zoom = this.getZoom ? (this.getZoom() || 14) : 14;
        rest[0] = zoom;
      }

      if (!hasValidSize) {
        if (typeof this._resetView === 'function' && Number.isFinite(+lat) && Number.isFinite(+lng)) {
          try {
            this._zoom = Number.isFinite(+zoom) ? +zoom : (this._zoom || 14);
            this._lastCenter = Lib.latLng(lat, lng);
          } catch (_e) {}
        }
        return this;
      }

      if (needsStop) {
        try { this.stop(); } catch (_e) {}
      }
      try {
        return original.call(this, [lat, lng], ...rest);
      } catch (error) {
        browserLogger.warn(`[map guard] ${methodName} threw, falling back to instant setView`, error);
        try { return originalSetView.call(this, [lat, lng], zoom); }
        catch (fallbackError) {
          browserLogger.warn('[map guard] fallback setView also threw', fallbackError);
          return this;
        }
      }
    };
  });
}
