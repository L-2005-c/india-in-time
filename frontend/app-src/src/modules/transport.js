import { getTransportConfig } from '../data/cities.js';
import { hvKm } from '../utils/geo.js';
import { getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getSmartTravelTime, getSmartVisitTime } from '../utils/travel-time.js';
export { getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getSmartTravelTime, getSmartVisitTime };
export function getTransportOptions(fromCoords, toCoords, cityId, arriveMin) {
  const config = getTransportConfig(cityId) || {};
  const km = fromCoords && toCoords ? hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) : 3;
  const trafficMult = getTrafficMultiplier(config.congestion || 1.0, arriveMin);
  const options = [];
  if (km <= 2.0) options.push({ mode:'walk', icon:'🚶', label:'Walk', fare:0, fareStr:'Free', time:Math.round(km*14), link: toCoords?`https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=walking`:'#' });
  const busFare = config.busFare || [10,40];
  options.push({ mode:'bus', icon:'🚌', label:'Bus', fare:Math.round(busFare[0]+(busFare[1]-busFare[0])*Math.min(1,km/10)), get fareStr(){return `₹${this.fare}`;}, time:Math.round((km/0.3)*trafficMult), link:toCoords?`https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit`:'#' });
  options.push({ mode:'auto', icon:'🛺', label:'Auto', fare:Math.round((config.autoBase||30)+km*(config.autoPerKm||12)), get fareStr(){return `₹${this.fare}`;}, time:Math.round((km/0.4)*trafficMult), link:toCoords?`https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving`:'#' });
  options.push({ mode:'cab', icon:'🚕', label:'Cab', fare:Math.round((config.cabBase||50)+km*(config.cabPerKm||18)), get fareStr(){return `₹${this.fare}`;}, time:Math.round((km/0.45)*trafficMult), link:toCoords?`https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving`:'#' });
  return options;
}
export function getTrafficMultiplierForCity(cityId, minuteOfDay) {
  const config = getTransportConfig(cityId) || {};
  return getTrafficMultiplier(config.congestion || 1.0, minuteOfDay);
}
export function getSmartTravelTimeForCity(fromCoords, toCoords, cityId, arriveMin, isFirstStop) {
  const config = getTransportConfig(cityId) || {};
  return getSmartTravelTime(fromCoords, toCoords, config.congestion || 1.0, arriveMin, isFirstStop, hvKm);
}
