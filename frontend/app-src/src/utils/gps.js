/**
 * GPS quality filter + fix coordination (extracted from core/app.js).
 */
export const GPS_MAX_ACCURACY_M = 60;
export const GPS_MAX_PLAUSIBLE_SPEED_MS = 55;

/**
 * @param {GeolocationPosition} pos
 * @param {[number,number]|null} lastAcceptedFix [lat,lon]
 * @param {number} lastAcceptedFixAt epoch ms
 * @param {function} hvKm haversine km
 */
export function isPlausibleGpsFix(pos, lastAcceptedFix, lastAcceptedFixAt, hvKm) {
  if (!lastAcceptedFix) return true;
  const elapsedS = (pos.timestamp - lastAcceptedFixAt) / 1000;
  if (elapsedS <= 0) return true;
  const movedKm = hvKm(
    lastAcceptedFix[0],
    lastAcceptedFix[1],
    pos.coords.latitude,
    pos.coords.longitude
  );
  const impliedSpeed = (movedKm * 1000) / elapsedS;
  if (impliedSpeed > GPS_MAX_PLAUSIBLE_SPEED_MS) return false;
  const acc = pos.coords.accuracy;
  if (Number.isFinite(acc) && acc > GPS_MAX_ACCURACY_M && impliedSpeed > 2) return false;
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
