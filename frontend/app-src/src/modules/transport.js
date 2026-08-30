import { getTransportConfig } from '../data/cities.js';
import { hvKm } from '../utils/geo.js';
import { getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getSmartTravelTime, getSmartVisitTime, ROAD_NETWORK_FACTOR } from '../utils/travel-time.js';
export { getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getSmartTravelTime, getSmartVisitTime, ROAD_NETWORK_FACTOR };

export function getTransportOptions(fromCoords, toCoords, cityId, arriveMin) {
  const config = getTransportConfig(cityId) || {};
  const straightKm = fromCoords && toCoords ? hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) : 2;
  const km = Math.round((straightKm * (ROAD_NETWORK_FACTOR || 1.42)) * 10) / 10;
  const trafficMult = getTrafficMultiplier(config.congestion || 1.0, arriveMin);
  
  const fromParam = fromCoords && Number.isFinite(fromCoords[0]) ? `origin=${fromCoords[0]},${fromCoords[1]}&` : '';
  const toParam = toCoords && Number.isFinite(toCoords[0]) ? `destination=${toCoords[0]},${toCoords[1]}` : '';
  const gmapBase = `https://www.google.com/maps/dir/?api=1&${fromParam}${toParam}`;

  const options = [];
  if (km <= 2.5) {
    options.push({
      mode: 'walk',
      icon: '🚶',
      label: 'Walk',
      fare: 0,
      fareStr: 'Free',
      time: Math.max(1, Math.round(km * 13.5)),
      link: toCoords ? `${gmapBase}&travelmode=walking` : '#',
    });
  }

  const busFare = config.busFare || [10, 40];
  options.push({
    mode: 'bus',
    icon: '🚌',
    label: 'Bus',
    fare: Math.round(busFare[0] + (busFare[1] - busFare[0]) * Math.min(1, km / 12)),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.max(3, Math.round((km / 0.23) * trafficMult)),
    link: toCoords ? `${gmapBase}&travelmode=transit` : '#',
  });

  options.push({
    mode: 'auto',
    icon: '🛺',
    label: 'Auto',
    fare: Math.round((config.autoBase || 30) + km * (config.autoPerKm || 13)),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.max(1, Math.round((km / 0.33) * trafficMult)),
    link: toCoords ? `${gmapBase}&travelmode=driving` : '#',
  });

  options.push({
    mode: 'cab',
    icon: '🚕',
    label: 'Cab',
    fare: Math.round((config.cabBase || 55) + km * (config.cabPerKm || 19)),
    get fareStr() { return `₹${this.fare}`; },
    time: Math.max(1, Math.round((km / 0.38) * trafficMult)),
    link: toCoords ? `${gmapBase}&travelmode=driving` : '#',
  });

  // Attach metadata so both array and object usages succeed
  options.km = km;
  options.straightKm = Math.round(straightKm * 10) / 10;
  options.trafficMult = trafficMult;
  options.options = options;
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
