'use strict';

/**
 * Multi-city Tourism POI Whitelist — high-confidence verified destinations.
 *
 * Covers every city in data/city-seeds.js. Curated entries take priority
 * over map-provider noise. Shopping malls that are tourist-relevant are
 * listed so they are NOT rejected by generic commercial filters.
 */

function entry(name, category, tier, lat, lon, aliases = []) {
  return { name, category, tier, lat, lon, aliases };
}

/** Visakhapatnam / Vizag */
const VIZAG = [
  entry('Ramakrishna Beach', 'beach', 'S', 17.7142, 83.3237, ['rk beach', 'r k beach']),
  entry('Rushikonda Beach', 'beach', 'S', 17.7825, 83.3851, ['rishikonda beach']),
  entry('Yarada Beach', 'beach', 'A', 17.6549, 83.2691),
  entry('Bheemili Beach', 'beach', 'A', 17.8903, 83.4559, ['bheemunipatnam beach', 'bhimili beach']),
  entry('Appikonda Beach', 'beach', 'B', 17.5681, 83.1714),
  entry('Gangavaram Beach', 'beach', 'B', 17.6192, 83.2329),
  entry('Sagar Nagar Beach', 'beach', 'B', 17.7618, 83.3604, ['sagarnagar beach']),
  entry('Mangamaripeta Beach', 'beach', 'B', 17.8252, 83.4163),
  entry('Lawsons Bay Beach', 'beach', 'B', 17.7338, 83.3424, ["lawson's bay", 'lawson bay']),
  entry('Kailasagiri', 'scenic', 'S', 17.7492, 83.3418, ['kailashgiri', 'kailasagiri hill']),
  entry('Dolphins Nose Lighthouse', 'viewpoint', 'A', 17.6765, 83.2926, ['dolphin nose', "dolphin's nose"]),
  entry('Thotlakonda Buddhist Complex', 'heritage', 'A', 17.8285, 83.4092, ['thotlakonda']),
  entry('Bavikonda Buddhist Complex', 'heritage', 'A', 17.8177, 83.3910, ['bavikonda']),
  entry('Bojjana Konda', 'heritage', 'B', 17.7103, 83.016, ['bojjanakonda']),
  entry('Victory at Sea War Memorial', 'monument', 'B', 17.7187, 83.3322, ['victory at sea']),
  entry('INS Kursura Submarine Museum', 'museum', 'S', 17.7172, 83.3301, ['kursura', 'submarine museum']),
  entry('TU 142 Aircraft Museum', 'museum', 'A', 17.718, 83.3299, ['tu-142', 'aircraft museum']),
  entry('Matsyadarshini Aquarium', 'aquarium', 'A', 17.7127, 83.3199, ['matsyadarshini', 'aquarium']),
  entry('VUDA Park', 'park', 'B', 17.7241, 83.3395, ['vuda city central park']),
  entry('VMRDA City Central Park', 'park', 'B', 17.7218, 83.3055, ['city central park']),
  entry('Indira Gandhi Zoological Park', 'zoo', 'A', 17.7657, 83.3488, ['vizag zoo', 'igzoo']),
  entry('Kambalakonda Wildlife Sanctuary', 'wildlife', 'A', 17.7784, 83.3349, ['kambalakonda']),
  entry('Simhachalam Temple', 'temple', 'S', 17.7666, 83.2501, ['simhachalam']),
  entry('Sri Kanaka Mahalakshmi Temple', 'temple', 'A', 17.6998, 83.2971, ['kanaka mahalakshmi']),
  entry('ISKCON Temple Visakhapatnam', 'temple', 'A', 17.7678, 83.3667, ['iskcon vizag', 'iskcon']),
  entry('Ross Hill Church', 'temple', 'B', 17.6904, 83.2871, ['ross hill']),
  entry('CMR Central', 'shopping', 'A', 17.7345, 83.3162, ['cmr central mall', 'cmr mall']),
  entry('Inorbit Mall', 'shopping', 'A', 17.7398, 83.3168, ['inorbit mall vizag', 'inorbit visakhapatnam']),
  entry('Chitralaya Complex', 'shopping', 'C', 17.7125, 83.3005, ['chitralaya']),
  entry('Venkatadri Vantillu', 'food', 'B', 17.7251, 83.3205, ['venkatadri']),
  entry('Daspalla Restaurant', 'food', 'B', 17.7106, 83.3003, ['daspalla']),
  entry('Ramakrishna Beach Food Court', 'food', 'B', 17.7142, 83.3224, ['rk beach food court']),
  entry('Sea Inn Raju Gari Dhaba', 'food', 'B', 17.7839, 83.383, ['raju gari dhaba', 'sea inn']),
  entry('Sai Priya Beach Restaurant', 'food', 'B', 17.7858, 83.3845, ['sai priya']),
  entry('Alpha Hotel Vizag', 'food', 'C', 17.7122, 83.3018, ['alpha hotel']),
  entry('Tenneti Park', 'park', 'B', 17.7484, 83.3495),
];

const HYDERABAD = [
  entry('Charminar', 'scenic', 'S', 17.3616, 78.4747),
  entry('Golconda Fort', 'scenic', 'S', 17.3833, 78.4011, ['golkonda fort']),
  entry('Salar Jung Museum', 'museum', 'S', 17.3713, 78.4804),
  entry('Hussain Sagar', 'scenic', 'A', 17.4239, 78.4738, ['tank bund']),
  entry('Ramoji Film City', 'entertainment', 'A', 17.2543, 78.6808),
  entry('Chowmahalla Palace', 'heritage', 'A', 17.3578, 78.4717),
  entry('Birla Mandir Hyderabad', 'temple', 'A', 17.4062, 78.4691, ['birla mandir']),
  entry('Inorbit Mall Hyderabad', 'shopping', 'A', 17.4337, 78.3862, ['inorbit mall hyderabad']),
  entry('GVK One Mall', 'shopping', 'A', 17.4193, 78.4482, ['gvk one']),
];

const GOA = [
  entry('Baga Beach', 'beach', 'S', 15.5553, 73.7517),
  entry('Calangute Beach', 'beach', 'S', 15.5439, 73.7553),
  entry('Fort Aguada', 'scenic', 'A', 15.4924, 73.7735, ['aguada fort']),
  entry('Basilica of Bom Jesus', 'temple', 'S', 15.5009, 73.9116, ['bom jesus']),
  entry('Dudhsagar Falls', 'scenic', 'S', 15.3144, 74.3143),
  entry('Anjuna Beach', 'beach', 'A', 15.5752, 73.7405),
  entry('Palolem Beach', 'beach', 'A', 15.0100, 74.0232),
  entry('Old Goa Churches', 'heritage', 'A', 15.5036, 73.9122),
];

const JAIPUR = [
  entry('Amber Fort', 'scenic', 'S', 26.9855, 75.8513, ['amer fort']),
  entry('Hawa Mahal', 'scenic', 'S', 26.9239, 75.8267),
  entry('City Palace Jaipur', 'heritage', 'S', 26.9258, 75.8236, ['city palace']),
  entry('Jantar Mantar Jaipur', 'museum', 'A', 26.9248, 75.8246, ['jantar mantar']),
  entry('Jal Mahal', 'scenic', 'A', 26.9534, 75.8462),
  entry('Nahargarh Fort', 'scenic', 'A', 26.9373, 75.8155),
  entry('Albert Hall Museum', 'museum', 'A', 26.9117, 75.8195),
  entry('World Trade Park Jaipur', 'shopping', 'A', 26.8533, 75.8046, ['wtp jaipur']),
];

const DELHI = [
  entry('India Gate', 'scenic', 'S', 28.6129, 77.2295),
  entry('Red Fort', 'scenic', 'S', 28.6562, 77.2410, ['lal qila']),
  entry('Qutub Minar', 'scenic', 'S', 28.5244, 77.1855, ['qutb minar']),
  entry('Humayuns Tomb', 'heritage', 'S', 28.5933, 77.2507, ["humayun's tomb"]),
  entry('Lotus Temple', 'temple', 'A', 28.5535, 77.2588),
  entry('Akshardham Temple Delhi', 'temple', 'S', 28.6127, 77.2773, ['akshardham']),
  entry('Jama Masjid Delhi', 'temple', 'A', 28.6507, 77.2334, ['jama masjid']),
  entry('Chandni Chowk', 'shopping', 'A', 28.6505, 77.2303),
  entry('Connaught Place', 'shopping', 'A', 28.6315, 77.2167, ['cp delhi']),
  entry('Select Citywalk', 'shopping', 'A', 28.5286, 77.2191),
];

const MUMBAI = [
  entry('Gateway of India', 'scenic', 'S', 18.9220, 72.8347),
  entry('Marine Drive', 'scenic', 'S', 18.9432, 72.8236, ['queens necklace']),
  entry('Chhatrapati Shivaji Maharaj Vastu Sangrahalaya', 'museum', 'S', 18.9269, 72.8327, ['csmvs', 'prince of wales museum']),
  entry('Elephanta Caves', 'heritage', 'S', 18.9633, 72.9315),
  entry('Haji Ali Dargah', 'temple', 'A', 18.9827, 72.8089),
  entry('Siddhivinayak Temple', 'temple', 'A', 19.0169, 72.8309),
  entry('Juhu Beach', 'beach', 'A', 19.0996, 72.8258),
  entry('Phoenix Palladium', 'shopping', 'A', 18.9942, 72.8250, ['phoenix mall mumbai']),
  entry('High Street Phoenix', 'shopping', 'A', 18.9940, 72.8245),
];

const BENGALURU = [
  entry('Bangalore Palace', 'heritage', 'S', 12.9987, 77.5920, ['bengaluru palace']),
  entry('Lalbagh Botanical Garden', 'park', 'S', 12.9507, 77.5848, ['lalbagh']),
  entry('Cubbon Park', 'park', 'A', 12.9763, 77.5929),
  entry('ISKCON Temple Bangalore', 'temple', 'A', 13.0098, 77.5511, ['iskcon bengaluru']),
  entry('Tipu Sultan Summer Palace', 'heritage', 'A', 12.9592, 77.5736),
  entry('Bannerghatta National Park', 'wildlife', 'A', 12.8005, 77.5770),
  entry('UB City Mall', 'shopping', 'A', 12.9718, 77.5960, ['ub city']),
  entry('Phoenix Marketcity Bangalore', 'shopping', 'A', 12.9972, 77.6964),
];

const KOCHI = [
  entry('Fort Kochi Beach', 'beach', 'A', 9.9658, 76.2421),
  entry('Chinese Fishing Nets', 'scenic', 'S', 9.9681, 76.2441, ['chinese nets']),
  entry('Mattancherry Palace', 'heritage', 'A', 9.9580, 76.2595, ['dutch palace']),
  entry('St Francis Church Kochi', 'temple', 'A', 9.9659, 76.2411),
  entry('Jewish Synagogue Kochi', 'heritage', 'A', 9.9575, 76.2595, ['pardesi synagogue']),
  entry('Marine Drive Kochi', 'scenic', 'A', 9.9816, 76.2754),
  entry('Lulu Mall Kochi', 'shopping', 'A', 10.0272, 76.3081, ['lulu mall']),
];

const AGRA = [
  entry('Taj Mahal', 'scenic', 'S', 27.1751, 78.0421),
  entry('Agra Fort', 'scenic', 'S', 27.1795, 78.0211),
  entry('Mehtab Bagh', 'park', 'A', 27.1797, 78.0419),
  entry('Itmad-ud-Daulah', 'heritage', 'A', 27.1929, 78.0310, ['baby taj']),
  entry('Akbar Tomb Sikandra', 'heritage', 'A', 27.2207, 77.9506, ['sikandra']),
  entry('Jama Masjid Agra', 'temple', 'B', 27.1837, 78.0179),
];

const VARANASI = [
  entry('Dashashwamedh Ghat', 'scenic', 'S', 25.3062, 83.0107),
  entry('Kashi Vishwanath Temple', 'temple', 'S', 25.3109, 83.0107, ['kashi vishwanath']),
  entry('Assi Ghat', 'scenic', 'A', 25.2887, 83.0061),
  entry('Sarnath', 'heritage', 'S', 25.3716, 83.0252),
  entry('Ramnagar Fort', 'heritage', 'A', 25.2694, 83.0292),
  entry('Manikarnika Ghat', 'scenic', 'A', 25.3102, 83.0140),
];

const KOLKATA = [
  entry('Victoria Memorial', 'scenic', 'S', 22.5448, 88.3426),
  entry('Howrah Bridge', 'scenic', 'S', 22.5851, 88.3468, ['rabindra setu']),
  entry('Indian Museum', 'museum', 'S', 22.5580, 88.3507),
  entry('Dakshineswar Kali Temple', 'temple', 'S', 22.6550, 88.3570, ['dakshineswar']),
  entry('Kalighat Kali Temple', 'temple', 'A', 22.5204, 88.3425, ['kalighat']),
  entry('Prinsep Ghat', 'scenic', 'A', 22.5552, 88.3317),
  entry('South City Mall', 'shopping', 'A', 22.5016, 88.3619),
];

/** City key → entries. Keys match city-seeds + common aliases. */
const CITY_WHITELISTS = {
  visakhapatnam: VIZAG,
  vizag: VIZAG,
  hyderabad: HYDERABAD,
  goa: GOA,
  jaipur: JAIPUR,
  delhi: DELHI,
  newdelhi: DELHI,
  mumbai: MUMBAI,
  bombay: MUMBAI,
  bengaluru: BENGALURU,
  bangalore: BENGALURU,
  kochi: KOCHI,
  cochin: KOCHI,
  agra: AGRA,
  varanasi: VARANASI,
  benares: VARANASI,
  kolkata: KOLKATA,
  calcutta: KOLKATA,
  udaipur: [], // seeds-only for now; classifier still applies
};

function buildIndex(entries) {
  const byExact = new Map();
  const byAlias = new Map();
  for (const e of entries) {
    const key = String(e.name).toLowerCase().trim();
    byExact.set(key, e);
    for (const a of e.aliases || []) {
      byAlias.set(String(a).toLowerCase().trim(), e);
    }
  }
  return { byExact, byAlias, entries };
}

const INDEX_BY_CITY = {};
for (const [city, entries] of Object.entries(CITY_WHITELISTS)) {
  INDEX_BY_CITY[city] = buildIndex(entries);
}

/** Global index across all cities for alias fallback */
const GLOBAL_INDEX = buildIndex(
  Object.values(CITY_WHITELISTS).flat()
);

/** Backward-compatible export */
const VIZAG_WHITELIST = VIZAG;

/**
 * Resolve a place against curated whitelist.
 * Prefers city-specific index, falls back to global.
 */
function resolveWhitelist(place, cityHint = null) {
  const name = String(place?.name || '').toLowerCase().trim();
  if (!name) return null;

  const city = String(cityHint || place?.city || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  const tryIndex = (index) => {
    if (!index) return null;
    if (index.byExact.has(name)) return index.byExact.get(name);
    if (index.byAlias.has(name)) return index.byAlias.get(name);
    for (const e of index.entries) {
      const en = e.name.toLowerCase();
      if (en.length >= 6 && (name.includes(en) || en.includes(name))) return e;
      for (const a of e.aliases || []) {
        if (a.length >= 5 && (name.includes(a) || a.includes(name))) return e;
      }
    }
    return null;
  };

  if (city && INDEX_BY_CITY[city]) {
    const hit = tryIndex(INDEX_BY_CITY[city]);
    if (hit) return hit;
  }
  return tryIndex(GLOBAL_INDEX);
}

const SHOPPING_DESTINATION_NAMES = new Set(
  Object.values(CITY_WHITELISTS)
    .flat()
    .filter((e) => e.category === 'shopping')
    .flatMap((e) => [e.name.toLowerCase(), ...(e.aliases || []).map((a) => a.toLowerCase())])
);

function isVerifiedShoppingDestination(name) {
  const n = String(name || '').toLowerCase().trim();
  if (SHOPPING_DESTINATION_NAMES.has(n)) return true;
  return /\b(cmr\s*central|inorbit\s*mall|gvk\s*one|lulu\s*mall|select\s*citywalk|phoenix\s*(palladium|marketcity)|ub\s*city|world\s*trade\s*park|high\s*street\s*phoenix|south\s*city\s*mall)\b/i.test(n);
}

/** All curated entries for a city (for seeding / diagnostics) */
function getCityWhitelist(cityHint) {
  const city = String(cityHint || '').toLowerCase().replace(/[^a-z]/g, '');
  return CITY_WHITELISTS[city] || [];
}

function listSupportedCities() {
  return Object.keys(CITY_WHITELISTS).filter((k) => (CITY_WHITELISTS[k] || []).length > 0);
}

module.exports = {
  VIZAG_WHITELIST,
  CITY_WHITELISTS,
  resolveWhitelist,
  isVerifiedShoppingDestination,
  SHOPPING_DESTINATION_NAMES,
  getCityWhitelist,
  listSupportedCities,
};
