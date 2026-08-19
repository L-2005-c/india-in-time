/**
 * GPS quality filter + fix coordination (extracted from core/app.js).
 */
export const GPS_MAX_ACCURACY_M = 3000;
export const GPS_MAX_PLAUSIBLE_SPEED_MS = 80;

/**
 * @param {GeolocationPosition} pos
 * @param {[number,number]|null} lastAcceptedFix [lat,lon]
 * @param {number} lastAcceptedFixAt epoch ms
 * @param {function} hvKm haversine km
 */
export function isPlausibleGpsFix(pos, lastAcceptedFix, lastAcceptedFixAt, hvKm) {
  if (!pos || !pos.coords) return false;
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;

  if (!lastAcceptedFix || !Number.isFinite(lastAcceptedFix[0]) || !Number.isFinite(lastAcceptedFix[1])) {
    return true;
  }
  const elapsedS = (pos.timestamp - lastAcceptedFixAt) / 1000;
  if (elapsedS <= 0 || elapsedS > 20) return true;

  const movedKm = hvKm(
    lastAcceptedFix[0],
    lastAcceptedFix[1],
    lat,
    lon
  );
  const impliedSpeed = (movedKm * 1000) / elapsedS;
  if (impliedSpeed > GPS_MAX_PLAUSIBLE_SPEED_MS && movedKm > 1.0) return false;
  const acc = pos.coords.accuracy;
  if (Number.isFinite(acc) && acc > GPS_MAX_ACCURACY_M && impliedSpeed > 10) return false;
  return true;
}

export function createGpsFixCoordinator() {
  let waiters = [];
  return {
    notifyFix(lat, lon) {
      const list = waiters;
      waiters = [];
      list.forEach((w) => w.resolve({ lat, lon }));
    },
    notifyError(err) {
      const list = waiters;
      waiters = [];
      list.forEach((w) => w.reject(err));
    },
    waitForFirst(timeoutMs, current) {
      if (Number.isFinite(current?.lat) && Number.isFinite(current?.lon)) {
        return Promise.resolve({ lat: current.lat, lon: current.lon });
      }
      return new Promise((resolve, reject) => {
        const entry = {
          resolve: (pos) => { clearTimeout(timer); resolve(pos); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        };
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== entry);
          reject(new Error('GPS fix timed out'));
        }, timeoutMs);
        waiters.push(entry);
      });
    },
  };
}
