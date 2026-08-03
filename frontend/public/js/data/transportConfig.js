// ══════════════════════════════════════════════════
// CITY TRANSPORT CONFIG — Per-city fare rates & modes
// ══════════════════════════════════════════════════
export const CITY_TRANSPORT_CONFIG = {
  vizag:     { hasMetro:false, hasTrain:true,  busFare:[10,30],  autoBase:25, autoPerKm:10, cabBase:50,  cabPerKm:14, trainFare:[10,40], congestion:0.9  },
  hyderabad: { hasMetro:true,  hasTrain:true,  busFare:[10,30],  autoBase:25, autoPerKm:12, cabBase:50,  cabPerKm:15, trainFare:[10,30], metroFare:[10,60], congestion:1.15 },
  goa:       { hasMetro:false, hasTrain:false, busFare:[10,25],  autoBase:30, autoPerKm:14, cabBase:80,  cabPerKm:18, congestion:0.75 },
  jaipur:    { hasMetro:true,  hasTrain:true,  busFare:[10,25],  autoBase:25, autoPerKm:11, cabBase:50,  cabPerKm:14, trainFare:[10,25], metroFare:[10,30], congestion:1.0  },
  udaipur:   { hasMetro:false, hasTrain:false, busFare:[10,20],  autoBase:20, autoPerKm:10, cabBase:50,  cabPerKm:14, congestion:0.85 },
  delhi:     { hasMetro:true,  hasTrain:true,  busFare:[10,30],  autoBase:25, autoPerKm:11, cabBase:50,  cabPerKm:16, trainFare:[10,30], metroFare:[10,60], congestion:1.3  },
  mumbai:    { hasMetro:true,  hasTrain:true,  busFare:[5,25],   autoBase:23, autoPerKm:14, cabBase:50,  cabPerKm:18, trainFare:[5,15],  metroFare:[10,50], congestion:1.35 },
  bengaluru: { hasMetro:true,  hasTrain:true,  busFare:[10,30],  autoBase:30, autoPerKm:13, cabBase:50,  cabPerKm:16, trainFare:[10,25], metroFare:[10,55], congestion:1.25 },
  kochi:     { hasMetro:true,  hasTrain:true,  busFare:[8,25],   autoBase:25, autoPerKm:12, cabBase:50,  cabPerKm:15, trainFare:[10,20], metroFare:[10,40], congestion:0.9  },
  agra:      { hasMetro:false, hasTrain:true,  busFare:[10,25],  autoBase:20, autoPerKm:10, cabBase:40,  cabPerKm:13, trainFare:[10,25], congestion:1.0  },
  varanasi:  { hasMetro:false, hasTrain:true,  busFare:[10,20],  autoBase:20, autoPerKm:10, cabBase:40,  cabPerKm:13, trainFare:[10,20], congestion:1.05 },
  kolkata:   { hasMetro:true,  hasTrain:true,  busFare:[7,25],   autoBase:25, autoPerKm:12, cabBase:40,  cabPerKm:14, trainFare:[5,15],  metroFare:[5,30],  congestion:1.2  },
};

export const DEFAULT_TRANSPORT_CONFIG = { hasMetro:false, hasTrain:false, busFare:[10,30], autoBase:25, autoPerKm:12, cabBase:50, cabPerKm:15, congestion:1.0 };

export const ENTRY_FEE_ESTIMATES = { scenic:50, temple:0, beach:0, food:0, break:0 };

export function getTransportConfig(cityId, currentCityId) {
  return CITY_TRANSPORT_CONFIG[cityId] || CITY_TRANSPORT_CONFIG[currentCityId] || DEFAULT_TRANSPORT_CONFIG;
}
