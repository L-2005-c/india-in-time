// Geometry, route-ordering and place-list helper functions.
// All pure functions — no shared app state, no DOM access.
import { getHiddenGems } from '../data/cities.js';
import { calculateExperienceScore, t2m } from './time-intel.js';

// Shared guard against NaN/undefined/malformed coordinate pairs. Any place
// with bad coords (missing geocode, failed AI hydration, etc.) must never
// reach a Leaflet L.marker()/L.polyline() call — Leaflet throws "Invalid
// LatLng object", which crashes whatever loop or function called it.
const hasValidCoords = c => Array.isArray(c) && c.length === 2 && c.every(n => Number.isFinite(n));

// How much one "unit" of bad time-fit (a stop landing at a rough time —
// closed, peak crowd, missed golden hour, heat/rain) counts against, in
// the same km units as travel distance, when the optimizer weighs order
// changes. Tuned so time-fit meaningfully influences order without
// completely overriding geography.
const TIME_FIT_KM_WEIGHT = 2.2;

const hvKm=(la1,lo1,la2,lo2)=>{const R=6371,dL=(la2-la1)*Math.PI/180,dO=(lo2-lo1)*Math.PI/180;const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};

const DEDUPE_STOPWORDS = new Set(['the','of','and','temple','beach','fort','park','museum','lake','garden','road','street','point','view','city','centre','center']);

function isFiniteLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function normalizeLatLon(coords){
  // Expect [lat, lon]. If it looks swapped (common in older saved plans), fix it.
  const a=Number(coords?.[0]);
  const b=Number(coords?.[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) return coords;
  const aIsLat=a>=6 && a<=38;
  const aIsLon=a>=68 && a<=98;
  const bIsLat=b>=6 && b<=38;
  const bIsLon=b>=68 && b<=98;
  if (aIsLat && bIsLon) return [a,b];
  if (aIsLon && bIsLat) return [b,a];
  return [a,b];
}

function significantWords(n){
  return String(n||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=4 && !DEDUPE_STOPWORDS.has(w));
}

function dedupePlacesByProximity(list){
  const all = [...list].sort((a,b)=>(b.importanceScore||0)-(a.importanceScore||0));
  const kept = [];
  for(const place of all){
    if (!hasValidCoords(place?.coords)) continue;
    const words = significantWords(place.name);
    const dup = kept.find(k => {
      if (!hasValidCoords(k.coords)) return false;
      const d = hvKm(k.coords[0],k.coords[1],place.coords[0],place.coords[1]);
      if (d > 0.18) return false;
      const kWords = significantWords(k.name);
      return words.some(w => kWords.includes(w));
    });
    if (dup) {
      dup.importanceScore = Math.max(dup.importanceScore||0, place.importanceScore||0);
      dup.isHiddenGem = dup.isHiddenGem || place.isHiddenGem;
      continue;
    }
    kept.push(place);
  }
  return kept;
}

function withHiddenGems(cityId, list){
  const gems = getHiddenGems(cityId);
  return dedupePlacesByProximity(gems.length ? [...list, ...gems] : list);
}

function mergePlacePools(...pools){
  const byName=new Map();
  for(const place of pools.flat()){
    if(!hasValidCoords(place?.coords)) continue;
    const key=String(place.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!key) continue;
    place.id = place.id || key;
    const existing=byName.get(key);
    if(!existing){
      byName.set(key,place);
      continue;
    }
    byName.set(key,{
      ...place,
      ...existing,
      id: existing.id || place.id || key,
      importanceScore:Math.max(existing.importanceScore||0,place.importanceScore||0),
      importance:(existing.importanceScore||0)>=(place.importanceScore||0)?existing.importance:place.importance,
    });
  }
  return dedupePlacesByProximity([...byName.values()]);
}

function sortNearestNeighbor(arr,sLat,sLon){
  if(arr.length<=1)return arr;
  let sorted=[],unsorted=[...arr],firstIdx=0;
  if(sLat&&sLon){let minD=Infinity;for(let i=0;i<unsorted.length;i++){const d=hvKm(sLat,sLon,unsorted[i].coords[0],unsorted[i].coords[1]);if(d<minD){minD=d;firstIdx=i;}}}
  sorted.push(unsorted.splice(firstIdx,1)[0]);
  while(unsorted.length>0){const last=sorted[sorted.length-1];let ci=0,minD=Infinity;for(let i=0;i<unsorted.length;i++){const d=hvKm(last.coords[0],last.coords[1],unsorted[i].coords[0],unsorted[i].coords[1]);if(d<minD){minD=d;ci=i;}}sorted.push(unsorted.splice(ci,1)[0]);}
  return sorted;
}

function routeDistanceKm(stops,start){
  if(!Array.isArray(stops)||stops.length===0) return 0;
  let total=0;
  let prev=start;
  for(const stop of stops){
    if(prev) total+=hvKm(prev[0],prev[1],stop.coords[0],stop.coords[1]);
    prev=stop.coords;
  }
  return total;
}

function centroidOfStops(stops){
  if(!Array.isArray(stops)||stops.length===0) return null;
  const sum=stops.reduce((acc,stop)=>{
    acc.lat+=stop.coords[0];
    acc.lon+=stop.coords[1];
    return acc;
  },{lat:0,lon:0});
  return [sum.lat/stops.length,sum.lon/stops.length];
}

function clusterStopsByArea(stops){
  if(!Array.isArray(stops)||stops.length===0) return [];

  const CLUSTER_RADIUS_KM = 3.2;
  const clusters = [];

  for(const stop of stops){
    let bestCluster = null;
    let bestDist = Infinity;

    for(const cluster of clusters){
      const d = hvKm(cluster.center[0], cluster.center[1], stop.coords[0], stop.coords[1]);
      if(d < CLUSTER_RADIUS_KM && d < bestDist){
        bestCluster = cluster;
        bestDist = d;
      }
    }

    if(!bestCluster){
      clusters.push({ stops:[stop], center:[stop.coords[0], stop.coords[1]] });
      continue;
    }

    bestCluster.stops.push(stop);
    bestCluster.center = centroidOfStops(bestCluster.stops);
  }

  return clusters;
}

function orderStopsAreaWise(stops,start){
  if(!Array.isArray(stops)||stops.length<=2) return [...(stops||[])];

  const clusters = clusterStopsByArea(stops);
  const clusterOrder = sortNearestNeighbor(
    clusters.map((cluster, index)=>({
      id:`cluster_${index}`,
      coords:cluster.center,
      cluster,
    })),
    start?.[0],
    start?.[1]
  );

  const ordered = [];
  let currentStart = start;

  for(const item of clusterOrder){
    const local = sortNearestNeighbor(item.cluster.stops, currentStart?.[0], currentStart?.[1]);
    ordered.push(...local);
    currentStart = local[local.length - 1]?.coords || currentStart;
  }

  return ordered;
}

function estimateTimeFitPenaltyKm(stops, start) {
  if (!Array.isArray(stops) || !stops.length) return 0;
  let clock = t2m(document.getElementById('s-time')?.value || '09:00', 9 * 60);
  let prev = start;
  let penalty = 0;
  for (const stop of stops) {
    if (prev) clock += Math.max(5, Math.round(hvKm(prev[0], prev[1], stop.coords[0], stop.coords[1]) / 0.45));
    const { score } = calculateExperienceScore(stop, clock % 1440);
    penalty += (1 - score / 100) * TIME_FIT_KM_WEIGHT; // 0 = perfect fit, full weight = worst
    clock += stop.vt || 60;
    prev = stop.coords;
  }
  return penalty;
}

function optimizeStopOrder(stops,start){
  if(!Array.isArray(stops)||stops.length<=2) return [...(stops||[])];

  // Combined cost = travel distance + time-of-day fitness penalty, so the
  // 2-opt search below can trade a slightly longer drive for a much better-
  // timed visit (e.g. hitting a sunset spot near sunset, or dodging a
  // stop's peak-crowd window) instead of purely chasing the shortest route.
  const routeCost=(candidate)=>routeDistanceKm(candidate,start)+estimateTimeFitPenaltyKm(candidate,start);

  let ordered=orderStopsAreaWise(stops,start);
  let improved=true;
  let guard=0;

  while(improved&&guard<8){
    improved=false;
    guard+=1;
    for(let i=0;i<ordered.length-2;i++){
      for(let j=i+1;j<ordered.length-1;j++){
        const candidate=[
          ...ordered.slice(0,i),
          ...ordered.slice(i,j+1).reverse(),
          ...ordered.slice(j+1),
        ];
        if(routeCost(candidate)+0.05<routeCost(ordered)){
          ordered=candidate;
          improved=true;
        }
      }
    }
  }

  return ordered;
}

function bearingBetween(from,to){
  const toRad=v=>v*Math.PI/180;
  const toDeg=v=>(v*180/Math.PI+360)%360;
  const lat1=toRad(from[0]), lat2=toRad(to[0]);
  const dLon=toRad(to[1]-from[1]);
  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return toDeg(Math.atan2(y,x));
}

function keepNearbyCluster(stops,start,maxRadiusKm=6){
  if(!Array.isArray(stops)||stops.length<=1||!start) return [...(stops||[])];
  const sorted=sortNearestNeighbor(stops,start[0],start[1]);
  const anchor=sorted[0]?.coords || start;
  const nearby=sorted.filter(stop=>hvKm(anchor[0],anchor[1],stop.coords[0],stop.coords[1])<=maxRadiusKm);
  return nearby.length>=2 ? nearby : sorted.slice(0, Math.min(4, sorted.length));
}

function famousPlaceScore(stop,start){
  if(!stop?.coords) return -999;
  const dist = start ? hvKm(start[0], start[1], stop.coords[0], stop.coords[1]) : 0;
  const name = String(stop.name||'').toLowerCase();
  let fame = 0;
  fame += Number(stop.importanceScore||0);
  if(stop.importance==='must_see') fame += 25;
  else if(stop.importance==='famous') fame += 10;
  if(stop.aiRanked) fame += 8;
  if(String(stop.id||'').startsWith('wiki_')) fame += 5;
  if(stop.cat==='beach' || stop.cat==='temple') fame += 2;
  if(/\b(park|beach|temple|fort|palace|museum|zoo|aquarium|caves|cave|hill|peak|viewpoint|view point|ghat|falls|lake|garden|island|monument|statue)\b/.test(name)) fame += 3;
  if(/\b(famous|iconic|heritage|central|main|old|grand)\b/.test(name)) fame += 2;
  if(stop.wikiMatched) fame += 2;
  return fame * 4 - dist;
}

function prioritizePlanStops(stops,start,prefs=[]){
  if(!Array.isArray(stops)||!stops.length) return [];
  const wantsFood = prefs.includes('food');
  let foodStops = stops.filter(s=>s.cat==='food');
  let attractionStops = stops.filter(s=>s.cat!=='food');

  if(attractionStops.length){
    attractionStops = [...attractionStops]
      .sort((a,b)=>famousPlaceScore(b,start)-famousPlaceScore(a,start))
      .slice(0, Math.min(attractionStops.length, 50)); // enough for multi-day trips
    attractionStops = sortNearestNeighbor(attractionStops, start?.[0], start?.[1]);
  }

  if(foodStops.length){
    foodStops = keepNearbyCluster(foodStops,start,wantsFood && prefs.length===1 ? 4 : 3.5)
      .sort((a,b)=>{
        const da = start ? hvKm(start[0],start[1],a.coords[0],a.coords[1]) : 0;
        const db = start ? hvKm(start[0],start[1],b.coords[0],b.coords[1]) : 0;
        return da-db;
      });
  }

  if(!wantsFood) return attractionStops;
  if(!attractionStops.length) return foodStops;
  return [...attractionStops, ...foodStops];
}

function interpolatePathPoint(path, ratio){
  if(path.length===0) return null;
  if(path.length===1) return path[0];
  const segments=[];
  let total=0;
  for(let i=1;i<path.length;i++){
    const len=hvKm(path[i-1][0],path[i-1][1],path[i][0],path[i][1]);
    segments.push(len);
    total+=len;
  }
  if(total<=0) return path[Math.min(path.length-1,1)];
  let target=total*Math.min(Math.max(ratio,0),1);
  for(let i=1;i<path.length;i++){
    const seg=segments[i-1];
    if(target<=seg){
      const t=seg===0?0:target/seg;
      return [
        path[i-1][0]+(path[i][0]-path[i-1][0])*t,
        path[i-1][1]+(path[i][1]-path[i-1][1])*t,
      ];
    }
    target-=seg;
  }
  return path[path.length-1];
}

function getRouteStopsForDay(dayStops){return (dayStops||[]).filter(stop=>!stop?.isBreak);}

function estimateStopLoadMinutes(stops){
  return (stops||[]).reduce((sum, stop) => sum + (stop?.vt || 60) + 20, 0);
}

export {
  hvKm, isFiniteLatLon, normalizeLatLon, significantWords, dedupePlacesByProximity, withHiddenGems, mergePlacePools, sortNearestNeighbor, routeDistanceKm, centroidOfStops, clusterStopsByArea, orderStopsAreaWise, estimateTimeFitPenaltyKm, optimizeStopOrder, bearingBetween, keepNearbyCluster, famousPlaceScore, prioritizePlanStops, interpolatePathPoint, getRouteStopsForDay, estimateStopLoadMinutes,
  hasValidCoords, TIME_FIT_KM_WEIGHT,
};
