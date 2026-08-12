function t2m(s, fallback = 0) {
  const [h, m] = String(s || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}
// Time-of-day / traffic / crowd / weather scoring helpers.
// All pure functions — arguments in, value out, no shared app state.
import { getTransportConfig } from '../data/cities.js';
import { hvKm } from './geo.js';

function getTrafficMultiplier(cityId, minuteOfDay){
  const config = getTransportConfig(cityId);
  const base = config.congestion || 1.0;
  if(minuteOfDay >= 8*60 && minuteOfDay < 10*60)  return base * 1.5;
  if(minuteOfDay >= 10*60 && minuteOfDay < 12*60) return base * 1.15;
  if(minuteOfDay >= 12*60 && minuteOfDay < 14*60) return base * 1.1;
  if(minuteOfDay >= 14*60 && minuteOfDay < 17*60) return base * 1.05;
  if(minuteOfDay >= 17*60 && minuteOfDay < 20*60) return base * 1.6;
  if(minuteOfDay >= 20*60 && minuteOfDay < 22*60) return base * 0.9;
  if(minuteOfDay >= 22*60 || minuteOfDay < 6*60)  return base * 0.7;
  return base * 1.0;
}

function getTrafficLevel(multiplier){
  if(multiplier <= 1.05) return { level:'light',   label:'Light Traffic',    emoji:'🟢' };
  if(multiplier <= 1.35) return { level:'moderate', label:'Moderate Traffic',  emoji:'🟡' };
  return                        { level:'heavy',    label:'Heavy Traffic',    emoji:'🔴' };
}

function getCrowdMultiplier(stop, dayOfWeek, minuteOfDay){
  let mult = 1.0;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if(isWeekend) mult += 0.2;
  const month = new Date().getMonth();
  if(month >= 9 || month <= 2) mult += 0.15;
  if(minuteOfDay >= 10*60 && minuteOfDay < 14*60) mult += 0.2;
  if(minuteOfDay >= 16*60 && minuteOfDay < 18*60) mult += 0.15;
  if(minuteOfDay < 8*60 || minuteOfDay >= 20*60) mult -= 0.15;
  if(stop?.cat === 'scenic') mult += 0.1;
  if(stop?.cat === 'temple' && (minuteOfDay >= 6*60 && minuteOfDay < 9*60)) mult += 0.15;
  if(stop?.cat === 'beach' && isWeekend) mult += 0.2;
  if(stop?.importance === 'must_see') mult += 0.15;
  return Math.max(0.7, Math.min(2.0, mult));
}

function getCrowdLevel(multiplier){
  if(multiplier <= 0.9) return { level:'low',     label:'Low Crowd',    emoji:'🟢' };
  if(multiplier <= 1.2) return { level:'medium',  label:'Medium Crowd', emoji:'🟡' };
  if(multiplier <= 1.5) return { level:'high',    label:'High Crowd',   emoji:'🟠' };
  return                       { level:'extreme', label:'Very Crowded', emoji:'🔴' };
}

function getSmartTravelTime(fromCoords, toCoords, cityId, arriveMin, isFirstStop){
  if(!fromCoords || !toCoords) return isFirstStop ? 10 : 20;
  const km = hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const baseMinutes = Math.max(isFirstStop ? 10 : 12, Math.min(45, Math.round(km / 0.42)));
  const trafficMult = getTrafficMultiplier(cityId, arriveMin);
  return Math.round(baseMinutes * trafficMult);
}

function getSmartVisitTime(stop, arriveMin, dayOfWeek){
  const baseVt = stop?.vt || 60;
  const crowdMult = getCrowdMultiplier(stop, typeof dayOfWeek==='number'?dayOfWeek:new Date().getDay(), arriveMin);
  const crowdAdjust = 1 + (crowdMult - 1) * 0.4;
  return Math.round(baseVt * Math.max(0.85, Math.min(1.4, crowdAdjust)));
}

function getTransportOptions(fromCoords, toCoords, cityId, arriveMin){
  const config = getTransportConfig(cityId);
  const km = fromCoords && toCoords ? hvKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) : 3;
  const trafficMult = getTrafficMultiplier(cityId, arriveMin);
  const options = [];
  if(km <= 2.0){
    options.push({ mode:'walk', icon:'🚶', label:'Walk', fare:0, fareStr:'Free', time:Math.round(km * 14),
      link:toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=walking` : '#' });
  }
  options.push({ mode:'bus', icon:'🚌', label:'Bus',
    fare:Math.round(config.busFare[0] + (config.busFare[1]-config.busFare[0]) * Math.min(1, km/10)),
    get fareStr(){ return `₹${this.fare}`; },
    time:Math.round((km / 0.3) * trafficMult),
    link:toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#' });
  if(config.hasMetro){
    const mf = config.metroFare || [10,60];
    let modeLabel = 'Metro';
    let lastMileFare = 0;
    let lastMileTime = 0;
    if (km > 3.5) {
      const lastMileKm = Math.min(3, km * 0.2); // assume nearest metro is 1-3km from dest
      if (lastMileKm > 1.2) {
        lastMileFare = Math.round(config.autoBase + (lastMileKm * config.autoPerKm));
        lastMileTime = Math.round((lastMileKm / 0.4) * trafficMult);
        modeLabel = 'Metro+Auto';
      } else {
        lastMileTime = Math.round(lastMileKm * 14);
        modeLabel = 'Metro+Walk';
      }
    }
    options.push({ mode:'metro', icon:'🚇', label:modeLabel,
      fare:Math.round(mf[0] + (mf[1]-mf[0]) * Math.min(1, km/15)) + lastMileFare,
      get fareStr(){ return `₹${this.fare}`; },
      time:Math.round(km / 0.55 + 8) + lastMileTime,
      link:toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#' });
  }
  if(config.hasTrain && km > 3){
    const tf = config.trainFare || [10,30];
    let modeLabel = 'Train';
    let lastMileFare = 0;
    let lastMileTime = 0;
    if (km > 5.0) {
      const lastMileKm = Math.min(4, km * 0.25);
      if (lastMileKm > 1.2) {
        lastMileFare = Math.round(config.autoBase + (lastMileKm * config.autoPerKm));
        lastMileTime = Math.round((lastMileKm / 0.4) * trafficMult);
        modeLabel = 'Train+Auto';
      } else {
        lastMileTime = Math.round(lastMileKm * 14);
        modeLabel = 'Train+Walk';
      }
    }
    options.push({ mode:'train', icon:'🚂', label:modeLabel,
      fare:Math.round(tf[0] + (tf[1]-tf[0]) * Math.min(1, km/20)) + lastMileFare,
      get fareStr(){ return `₹${this.fare}`; },
      time:Math.round(km / 0.5 + 12) + lastMileTime,
      link:toCoords ? `https://www.google.com/maps/dir/?api=1&destination=${toCoords[0]},${toCoords[1]}&travelmode=transit` : '#' });
  }
  options.push({ mode:'auto', icon:'🛺', label:'Auto',
    fare:Math.round(config.autoBase + config.autoPerKm * km),
    get fareStr(){ return `₹${this.fare}`; },
    time:Math.round((km / 0.4) * trafficMult),
    link:toCoords ? `https://book.olacabs.com/?drop_lat=${toCoords[0]}&drop_lng=${toCoords[1]}` : '#' });
  options.push({ mode:'cab', icon:'🚕', label:'Cab',
    fare:Math.round(config.cabBase + config.cabPerKm * km),
    get fareStr(){ return `₹${this.fare}`; },
    time:Math.round((km / 0.45) * trafficMult),
    link:toCoords ? `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${toCoords[0]}&dropoff[longitude]=${toCoords[1]}` : '#' });
  const cheapest = options.reduce((a,b) => a.fare <= b.fare ? a : b);
  const fastest  = options.reduce((a,b) => a.time <= b.time ? a : b);
  cheapest.isCheapest = true;
  if(fastest.mode !== cheapest.mode) fastest.isFastest = true;
  return { options, km, trafficMult };
}

function getCurrentLocalMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function getSunTimesClient(lat, lon, date = new Date()) {
  const dayKey = `${lat.toFixed(2)},${lon.toFixed(2)},${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (_sunTimesCache.has(dayKey)) return _sunTimesCache.get(dayKey);
  let result;
  try {
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const lngHour = lon / 15;
    const zenith = 90.833;
    const calc = (isRise) => {
      const t = dayOfYear + ((isRise ? 6 : 18) - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      let L = M + 1.916 * Math.sin((M * Math.PI) / 180) + 0.020 * Math.sin((2 * M * Math.PI) / 180) + 282.634;
      L = ((L % 360) + 360) % 360;
      let RA = (180 / Math.PI) * Math.atan(0.91764 * Math.tan((L * Math.PI) / 180));
      RA = ((RA % 360) + 360) % 360;
      const Lquadrant = Math.floor(L / 90) * 90;
      const RAquadrant = Math.floor(RA / 90) * 90;
      RA = RA + (Lquadrant - RAquadrant);
      RA /= 15;
      const sinDec = 0.39782 * Math.sin((L * Math.PI) / 180);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos((zenith * Math.PI) / 180) - sinDec * Math.sin((lat * Math.PI) / 180)) / (cosDec * Math.cos((lat * Math.PI) / 180));
      if (cosH > 1 || cosH < -1) return null;
      let H = isRise ? 360 - (180 / Math.PI) * Math.acos(cosH) : (180 / Math.PI) * Math.acos(cosH);
      H /= 15;
      const T = H + RA - 0.06571 * t - 6.622;
      let UT = T - lngHour;
      UT = ((UT % 24) + 24) % 24;
      let localT = UT + 5.5; // IST
      localT = ((localT % 24) + 24) % 24;
      return Math.round(localT * 60);
    };
    const sunriseMin = calc(true);
    const sunsetMin = calc(false);
    result = { sunriseMin: sunriseMin ?? 6 * 60, sunsetMin: sunsetMin ?? 18 * 60 + 30 };
  } catch (_e) {
    result = { sunriseMin: 6 * 60, sunsetMin: 18 * 60 + 30 };
  }
  _sunTimesCache.set(dayKey, result);
  return result;
}

function placeSunTimes(loc, date = new Date()) {
  const [lat, lon] = loc.coords || [20.5937, 78.9629];
  return getSunTimesClient(lat, lon, date);
}

function getPlaceDynamicStatus(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const ot = t2m(loc.ot || '06:00');
  const ct = t2m(loc.ct || '23:00', 23 * 60);
  // Some places (night markets, bars, 24hr spots) close after midnight, e.g.
  // 18:00–02:00. A plain `now < ot || now >= ct` check always reported these
  // as closed during their actual overnight open hours.
  const overnight = ct <= ot;
  const isOpen = overnight ? (now >= ot || now < ct) : (now >= ot && now < ct);
  if (!isOpen) return { status: 'closed', label: '🔴 Closed', color: 'var(--danger-color)' };
  const minsToClose = overnight ? (now < ct ? ct - now : (1440 - now) + ct) : ct - now;
  if (minsToClose <= 60 && minsToClose > 0) return { status: 'closing_soon', label: '🟡 Closing Soon', color: 'var(--warning-color)' };
  return { status: 'open', label: '🟢 Open', color: 'var(--success-color)' };
}

function getDaypartClient(nowMin, sunsetMin) {
  if (nowMin >= 5 * 60 && nowMin < 9 * 60) return 'earlyMorning';
  if (nowMin >= 9 * 60 && nowMin < 12 * 60) return 'lateMorning';
  if (nowMin >= 12 * 60 && nowMin < 16 * 60) return 'afternoon';
  if (nowMin >= 16 * 60 && nowMin < sunsetMin) return 'evening';
  if (nowMin >= sunsetMin || nowMin < 5 * 60) return 'night';
  return 'morning';
}

function getCrowdPrediction(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const isWeekend = [0, 6].includes(new Date().getDay());
  const { sunsetMin } = placeSunTimes(loc);
  const daypart = getDaypartClient(now, sunsetMin);

  let isPeakNow = false;
  if (loc.peak_hours) {
    const parts = loc.peak_hours.split('-');
    if (parts.length === 2) {
      const pStart = t2m(parts[0].trim());
      const pEnd = t2m(parts[1].trim());
      isPeakNow = now >= pStart && now <= pEnd;
    }
  }

  // Previously this only varied by weekday/weekend and otherwise ignored
  // time of day completely — a 2 AM stop showed the exact same crowd level
  // as an 11 AM one. Now it starts from a per-daypart baseline (same shape
  // as the backend engine) and layers weekend/peak-hour multipliers on top.
  let score = CROWD_BASE_BY_DAYPART[daypart] ?? 0.6;
  if (isWeekend) score *= CROWD_WEEKEND_MULT;
  if (isPeakNow) score *= CROWD_PEAK_MULT;
  if (loc.cat === 'market' || loc.cat === 'food') score *= 1.15;

  if (score < 0.35) return 'Very Low';
  if (score < 0.6) return 'Low';
  if (score < 0.95) return 'Moderate';
  if (score < 1.4) return 'High';
  return 'Very High';
}

function calculateExperienceScore(loc, simTime = window.globalSimulationTime) {
  let score = 50;
  const reasons = [];
  let state = "Normal";

  const status = getPlaceDynamicStatus(loc, simTime);
  const crowd = getCrowdPrediction(loc, simTime);
  const { sunriseMin, sunsetMin } = placeSunTimes(loc);

  if (status.status === 'closed') {
    return { score: 0, state: 'Closed', reasons: ['🔴 Currently Closed', 'Check opening hours before visiting.'] };
  }

  // Base score boost for being open
  score += 15;
  reasons.push('🟢 Currently Open');

  // Time of Day — windows are now the place's real sunrise/sunset (±75 min)
  // rather than a fixed 5:00-7:30 AM / 5:00-7:00 PM clock window, which used
  // to be off by well over an hour depending on the city and time of year.
  if (simTime >= sunriseMin - 30 && simTime <= sunriseMin + 90) {
    if (loc.is_sunrise_spot) {
      score += 35;
      state = "Sunrise Mode";
      reasons.push('🌅 Perfect time for Sunrise View');
      reasons.push('📸 Golden lighting for photography');
    } else {
      score += 10;
      state = "Morning Mode";
      reasons.push('🌤️ Peaceful morning atmosphere');
    }
  } else if (simTime >= sunsetMin - 90 && simTime <= sunsetMin + 30) {
    if (loc.is_sunset_spot) {
      score += 35;
      state = "Golden Hour";
      reasons.push('🌇 Perfect time for Sunset View');
      reasons.push('📸 Excellent Golden Hour lighting');
    } else {
      score += 10;
      state = "Evening Mode";
      reasons.push('🌆 Pleasant evening vibe');
    }
  } else if (simTime >= sunsetMin + 30) {
    if (loc.has_nightlife) {
      score += 25;
      state = "Night Mode";
      reasons.push('🍹 Vibrant Nightlife is active');
    } else if (loc.indoor_outdoor === 'outdoor' && loc.cat !== 'food') {
      score -= 20;
      reasons.push('🌙 Outdoor attraction at night (Limited visibility)');
    }
  }

  // Heat Alert & Weather
  if (window.realTemp && window.realTemp > 35 && simTime >= 720 && simTime <= 960) {
    if (loc.indoor_outdoor === 'indoor') {
      score += 20;
      state = "Heat Escape";
      reasons.push('❄️ Great AC/Indoor escape from extreme heat');
    } else if (loc.indoor_outdoor === 'outdoor') {
      score -= 30;
      state = "Heat Alert";
      reasons.push('⚠️ Extreme Heat warning for outdoor activity');
    }
  }
  // Rain and strong wind used to only show up as badges elsewhere
  // (getTimeBadgesHtml) without ever touching the score itself, so a
  // rain-soaked outdoor spot or a wind-battered viewpoint could still rank
  // as a top recommendation. Now they actually move the score.
  if (window.realWeatherMain && /rain|storm|drizzle/i.test(window.realWeatherMain) && loc.indoor_outdoor !== 'indoor') {
    score -= 20;
    reasons.push('🌧 Rain expected — outdoor visit may be uncomfortable');
  }
  if (window.realWind >= 30 && (loc.cat === 'beach' || loc.cat === 'scenic' || loc.is_sunset_spot)) {
    score -= 10;
    reasons.push('💨 Strong winds at this open viewpoint/beach');
  }

  // Crowd Analysis
  if (crowd === 'Very High') {
    score -= 15;
    reasons.push('👥 Very High Crowd expected');
  } else if (crowd === 'High') {
    score -= 5;
    reasons.push('👥 High Crowd expected');
  } else {
    score += 10;
    reasons.push('🚶 Low/Moderate Crowd expected');
  }
  
  if (status.status === 'closing_soon') {
    score -= 15;
    reasons.push('🟡 Closing soon (Hurry!)');
  }

  score = Math.max(1, Math.min(100, score));
  return { score, state: state !== "Normal" ? state : "Recommended", reasons };
}

function dayPartForMinutes(mins){
  if(mins < 11*60) return 'Morning';
  if(mins < 15*60) return 'Afternoon';
  if(mins < 19*60) return 'Evening';
  return 'Night';
}

function climateMode(temp){
  if(temp >= 33) return 'hot';
  if(temp <= 23) return 'cool';
  return 'pleasant';
}

function estimateTravelMinutes(prevCoords, stop, isFirstStop=false){
  if(!prevCoords || !stop?.coords) return isFirstStop ? 10 : 20;
  const km = hvKm(prevCoords[0], prevCoords[1], stop.coords[0], stop.coords[1]);
  return Math.max(isFirstStop ? 10 : 12, Math.min(35, Math.round(km / 0.42)));
}

function tripModeBonus(stop, tripMode){
  const weights = tripMode && TRIP_MODE_WEIGHTS[tripMode];
  if(!weights) return 0;
  let bonus = 0;
  if(weights.sunrise && stop.is_sunrise_spot) bonus += weights.sunrise;
  if(weights.sunset && stop.is_sunset_spot) bonus += weights.sunset;
  if(weights.nightlife && stop.has_nightlife) bonus += weights.nightlife;
  if(weights[stop.cat]) bonus += weights[stop.cat];
  return bonus;
}

function personaBonus(stop, personas){
  if(!personas || !personas.length) return 0;
  let bonus = 0;
  personas.forEach(p=>{
    const weights = PERSONA_WEIGHTS[p];
    if(!weights) return;
    if(weights.sunrise && stop.is_sunrise_spot) bonus += weights.sunrise;
    if(weights.sunset && stop.is_sunset_spot) bonus += weights.sunset;
    if(weights.safety && stop.family_friendly) bonus += weights.safety;
    if(weights[stop.cat]) bonus += weights[stop.cat];
  });
  return bonus;
}

function stopTimeScore(stop, arriveMin, temp, priorityIndex=0, wind=0, personas=null, tripMode=null){
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  let score = Math.max(0, 12 - priorityIndex) + Math.min(20, Number(stop.importanceScore||0) / 5);

  // Extreme heat: push outdoor stops out of the 12-16h window instead of
  // just favoring indoor ones — a real reroute signal, not just a note.
  if (stop.indoor_outdoor === 'outdoor' && temp >= 38 && arriveMin >= 12*60 && arriveMin <= 16*60) {
    score -= 25;
  }
  // Strong wind: warn beaches / viewpoints / sunset spots away from that slot.
  if (wind >= 30 && (stop.cat === 'beach' || stop.cat === 'scenic' || stop.is_sunset_spot)) {
    score -= 15;
  }
  score += personaBonus(stop, personas || window.selectedPersonas);
  score += tripModeBonus(stop, tripMode || window.selectedTripMode);

  if (stop.is_sunrise_spot && arriveMin >= 5.5*60 && arriveMin <= 7.5*60) score += 15;
  if (stop.is_sunset_spot && arriveMin >= 17*60 && arriveMin <= 18.5*60) score += 15;
  if (stop.has_nightlife && arriveMin >= 19*60) score += 8;
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && arriveMin >= 12*60 && arriveMin <= 16*60) score += 5;
  if (stop.best_visiting_hours) {
    const parts = stop.best_visiting_hours.split('-');
    if (parts.length === 2) {
      const sMin = t2m(parts[0].trim());
      const eMin = t2m(parts[1].trim());
      if (arriveMin >= sMin && arriveMin <= eMin) score += 10;
    }
  }

  if(stop.cat === 'food'){
    if(arriveMin >= 12*60 && arriveMin <= 15*60) score += 14;
    else if(arriveMin >= 18*60 && arriveMin <= 22*60) score += 16;
    else if(arriveMin >= 9*60 && arriveMin < 11*60) score += 6;
    else score -= 6;
    if(/\b(cafe|coffee|breakfast|bakery)\b/i.test(stop.name || '') && part === 'Morning') score += 4;
    if(/\b(seafood|biryani|restaurant|mess|eatery|hotel)\b/i.test(stop.name || '') && part !== 'Morning') score += 3;
    return score;
  }
  if(stop.cat === 'temple'){
    if(part === 'Morning') score += 12;
    else if(part === 'Evening') score += 8;
    else if(part === 'Afternoon') score += 1;
    else score -= 5;
    return score;
  }
  if(stop.cat === 'beach'){
    if(climate === 'hot'){
      if(part === 'Morning' || part === 'Evening') score += 12;
      else score -= 8;
    } else {
      if(part === 'Morning' || part === 'Evening') score += 9;
      else if(part === 'Afternoon') score += 3;
      else score -= 4;
    }
    return score;
  }
  if(climate === 'hot'){
    if(part === 'Morning' || part === 'Evening') score += 8;
    else if(part === 'Afternoon') score -= 2;
  } else {
    if(part === 'Morning' || part === 'Afternoon' || part === 'Evening') score += 6;
    else score -= 3;
  }
  return score;
}

function stopClimateNote(stop, arriveMin, temp){
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  
  if (stop.is_sunrise_spot && arriveMin >= 5.5*60 && arriveMin <= 7.5*60) return '🌅 Sunrise View';
  if (stop.is_sunset_spot && arriveMin >= 17*60 && arriveMin <= 18.5*60) return '🌇 Sunset View';
  if (stop.has_nightlife && arriveMin >= 19*60) return '🍹 Nightlife';
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && part === 'Afternoon') return '🏛️ Indoor Heat Escape';

  if(stop.cat === 'food'){
    if(part === 'Afternoon') return 'Lunch Stop';
    if(part === 'Evening') return 'Sunset Snack';
    if(part === 'Night') return 'Dinner Stop';
    return 'Food Break';
  }
  if(stop.cat === 'beach' && climate === 'hot') return part === 'Morning' ? 'Cool Morning Window' : 'Best Near Sunset';
  if(stop.cat === 'temple') return part === 'Morning' ? 'Peaceful Morning Visit' : 'Calmer Evening Slot';
  if(climate === 'hot' && part === 'Afternoon') return 'Short Climate-Friendly Visit';
  return `${part} Highlight`;
}

export {
  getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getSmartTravelTime, getSmartVisitTime, getTransportOptions, getCurrentLocalMin, getSunTimesClient, placeSunTimes, getPlaceDynamicStatus, getDaypartClient, getCrowdPrediction, calculateExperienceScore, dayPartForMinutes, climateMode, estimateTravelMinutes, tripModeBonus, personaBonus, stopTimeScore, stopClimateNote,
};
