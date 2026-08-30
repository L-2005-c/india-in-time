'use strict';

/**
 * data/goldenPoiDataset.js
 *
 * Golden Benchmark POI Dataset across 10 major Indian cities:
 * Visakhapatnam, Hyderabad, Bengaluru, Mumbai, Delhi, Jaipur, Goa, Chennai, Kolkata, Pune.
 *
 * Provides ground-truth canonical identities, exact surveyed coordinates,
 * known aliases, verified tourism categories, and coordinate tolerance radii.
 */

function poi(id, canonicalName, category, city, state, lat, lon, aliases = [], toleranceMeters = 800) {
  return {
    id,
    canonicalName,
    displayName: canonicalName,
    category,
    city,
    state,
    country: 'India',
    latitude: lat,
    longitude: lon,
    aliases,
    toleranceMeters,
    tourismStatus: 'VERIFIED_ATTRACTION',
    verificationStatus: 'VERIFIED',
    coordinateSource: 'AUTHORITATIVE_SURVEY',
  };
}

const GOLDEN_POIS = [
  // ── VISAKHAPATNAM ────────────────────────────────────────────────────────
  poi('vizag_rk_beach', 'Ramakrishna Beach', 'beach', 'Visakhapatnam', 'Andhra Pradesh', 17.7142, 83.3237, ['RK Beach', 'R K Beach', 'Ramakrishna Beach Vizag']),
  poi('vizag_rushikonda', 'Rushikonda Beach', 'beach', 'Visakhapatnam', 'Andhra Pradesh', 17.7825, 83.3851, ['Rishikonda Beach', 'Rushikonda']),
  poi('vizag_kailasagiri', 'Kailasagiri', 'scenic', 'Visakhapatnam', 'Andhra Pradesh', 17.7492, 83.3418, ['Kailashgiri', 'Kailasagiri Hill', 'Kailasagiri Park']),
  poi('vizag_submarine', 'INS Kursura Submarine Museum', 'museum', 'Visakhapatnam', 'Andhra Pradesh', 17.7172, 83.3301, ['Kursura', 'Submarine Museum', 'INS Kursura']),
  poi('vizag_tu142', 'TU 142 Aircraft Museum', 'museum', 'Visakhapatnam', 'Andhra Pradesh', 17.7180, 83.3299, ['TU-142', 'Aircraft Museum', 'TU 142 Museum']),
  poi('vizag_simhachalam', 'Sri Varaha Lakshmi Narasimha Temple, Simhachalam', 'temple', 'Visakhapatnam', 'Andhra Pradesh', 17.7666, 83.2501, ['Simhachalam Temple', 'Simhachalam', 'Narasimha Temple']),
  poi('vizag_yarada', 'Yarada Beach', 'beach', 'Visakhapatnam', 'Andhra Pradesh', 17.6549, 83.2691, ['Yarada']),
  poi('vizag_dolphin_nose', 'Dolphins Nose Lighthouse', 'viewpoint', 'Visakhapatnam', 'Andhra Pradesh', 17.6765, 83.2926, ['Dolphin Nose', "Dolphin's Nose", 'Dolphin Lighthouse']),
  poi('vizag_thotlakonda', 'Thotlakonda Buddhist Complex', 'heritage', 'Visakhapatnam', 'Andhra Pradesh', 17.8285, 83.4092, ['Thotlakonda', 'Thotlakonda Monastic Complex']),
  poi('vizag_bavikonda', 'Bavikonda Buddhist Complex', 'heritage', 'Visakhapatnam', 'Andhra Pradesh', 17.8177, 83.3910, ['Bavikonda']),
  poi('vizag_igzp', 'Indira Gandhi Zoological Park', 'zoo', 'Visakhapatnam', 'Andhra Pradesh', 17.7657, 83.3488, ['Vizag Zoo', 'IGZP', 'Indira Gandhi Zoo']),
  poi('vizag_matsyadarshini', 'Matsyadarshini Aquarium', 'aquarium', 'Visakhapatnam', 'Andhra Pradesh', 17.7127, 83.3199, ['Matsyadarshini', 'Vizag Aquarium']),
  poi('vizag_bheemili', 'Bheemili Beach', 'beach', 'Visakhapatnam', 'Andhra Pradesh', 17.8903, 83.4559, ['Bheemunipatnam Beach', 'Bhimili Beach', 'Bheemili']),

  // ── HYDERABAD ────────────────────────────────────────────────────────────
  poi('hyd_charminar', 'Charminar', 'monument', 'Hyderabad', 'Telangana', 17.3616, 78.4747, ['Char Minar', 'Four Minarets']),
  poi('hyd_golconda', 'Golconda Fort', 'scenic', 'Hyderabad', 'Telangana', 17.3833, 78.4011, ['Golkonda Fort', 'Golconda']),
  poi('hyd_salar_jung', 'Salar Jung Museum', 'museum', 'Hyderabad', 'Telangana', 17.3713, 78.4804, ['Salarjung Museum', 'Salar Jung']),
  poi('hyd_hussain_sagar', 'Hussain Sagar', 'scenic', 'Hyderabad', 'Telangana', 17.4239, 78.4738, ['Tank Bund', 'Hussain Sagar Lake', 'Buddha Statue Tank Bund']),
  poi('hyd_chowmahalla', 'Chowmahalla Palace', 'heritage', 'Hyderabad', 'Telangana', 17.3578, 78.4717, ['Chowmahalla']),
  poi('hyd_birla_mandir', 'Birla Mandir', 'temple', 'Hyderabad', 'Telangana', 17.4062, 78.4691, ['Birla Temple Hyderabad', 'Birla Mandir Hyderabad']),
  poi('hyd_ramoji', 'Ramoji Film City', 'entertainment', 'Hyderabad', 'Telangana', 17.2543, 78.6808, ['Ramoji', 'RFC']),
  poi('hyd_qutb_shahi', 'Qutb Shahi Tombs', 'heritage', 'Hyderabad', 'Telangana', 17.3894, 78.3962, ['Seven Tombs', 'Qutub Shahi Tombs']),
  poi('hyd_nehru_zoo', 'Nehru Zoological Park', 'zoo', 'Hyderabad', 'Telangana', 17.3508, 78.4516, ['Hyderabad Zoo', 'Nehru Zoo']),

  // ── BENGALURU ────────────────────────────────────────────────────────────
  poi('blr_bangalore_palace', 'Bangalore Palace', 'heritage', 'Bengaluru', 'Karnataka', 12.9988, 77.5921, ['Bengaluru Palace']),
  poi('blr_lalbagh', 'Lalbagh Botanical Garden', 'park', 'Bengaluru', 'Karnataka', 12.9507, 77.5848, ['Lalbagh', 'Lal Bagh']),
  poi('blr_cubbon_park', 'Cubbon Park', 'park', 'Bengaluru', 'Karnataka', 12.9779, 77.5952, ['Sri Chamarajendra Park', 'Cubbon']),
  poi('blr_iskcon', 'ISKCON Temple Bangalore', 'temple', 'Bengaluru', 'Karnataka', 13.0098, 77.5511, ['ISKCON Bangalore', 'Hare Krishna Hill']),
  poi('blr_tipu_palace', 'Tipu Sultan Summer Palace', 'heritage', 'Bengaluru', 'Karnataka', 12.9593, 77.5738, ['Tipu Palace Bangalore', 'Tipu Summer Palace']),
  poi('blr_visvesvaraya_museum', 'Visvesvaraya Industrial & Technological Museum', 'museum', 'Bengaluru', 'Karnataka', 12.9752, 77.5963, ['VITM Bangalore', 'Visvesvaraya Museum']),
  poi('blr_bannerghatta', 'Bannerghatta National Park', 'wildlife', 'Bengaluru', 'Karnataka', 12.8009, 77.5777, ['Bannerghatta Zoo', 'Bannerghatta Safari']),

  // ── MUMBAI ───────────────────────────────────────────────────────────────
  poi('mum_gateway', 'Gateway of India', 'monument', 'Mumbai', 'Maharashtra', 18.9220, 72.8347, ['Gateway of India Mumbai']),
  poi('mum_marine_drive', 'Marine Drive', 'scenic', 'Mumbai', 'Maharashtra', 18.9432, 72.8230, ["Queen's Necklace", 'Marine Drive Promenade']),
  poi('mum_elephanta', 'Elephanta Caves', 'heritage', 'Mumbai', 'Maharashtra', 18.9633, 72.9315, ['Elephanta Island Caves', 'Gharapuri']),
  poi('mum_csmvs', 'Chhatrapati Shivaji Maharaj Vastu Sangrahalaya', 'museum', 'Mumbai', 'Maharashtra', 18.9269, 72.8327, ['Prince of Wales Museum', 'CSMVS Museum']),
  poi('mum_siddhivinayak', 'Siddhivinayak Temple', 'temple', 'Mumbai', 'Maharashtra', 19.0169, 72.8304, ['Shree Siddhivinayak', 'Siddhivinayak Ganapati Temple']),
  poi('mum_bandra_fort', 'Castella de Aguada', 'heritage', 'Mumbai', 'Maharashtra', 19.0416, 72.8184, ['Bandra Fort']),
  poi('mum_kanheri_caves', 'Kanheri Caves', 'heritage', 'Mumbai', 'Maharashtra', 19.2056, 72.9067, ['Kanheri Caves Sanjay Gandhi']),

  // ── DELHI ────────────────────────────────────────────────────────────────
  poi('del_red_fort', 'Red Fort', 'heritage', 'Delhi', 'Delhi', 28.6562, 77.2410, ['Lal Qila', 'Red Fort Delhi']),
  poi('del_qutub_minar', 'Qutub Minar', 'heritage', 'Delhi', 'Delhi', 28.5245, 77.1855, ['Qutb Minar', 'Qutab Minar']),
  poi('del_india_gate', 'India Gate', 'monument', 'Delhi', 'Delhi', 28.6129, 77.2295, ['All India War Memorial']),
  poi('del_humayun_tomb', "Humayun's Tomb", 'heritage', 'Delhi', 'Delhi', 28.5933, 77.2507, ['Humayun Tomb', 'Maqbara e Humayun']),
  poi('del_lotus_temple', 'Lotus Temple', 'temple', 'Delhi', 'Delhi', 28.5535, 77.2588, ['Bahai House of Worship', 'Lotus Temple Delhi']),
  poi('del_akshardham', 'Akshardham Temple', 'temple', 'Delhi', 'Delhi', 28.6127, 77.2773, ['Swaminarayan Akshardham Delhi', 'Akshardham']),
  poi('del_national_museum', 'National Museum New Delhi', 'museum', 'Delhi', 'Delhi', 28.6118, 77.2193, ['National Museum Delhi']),

  // ── JAIPUR ───────────────────────────────────────────────────────────────
  poi('jai_amber_fort', 'Amber Fort', 'scenic', 'Jaipur', 'Rajasthan', 26.9855, 75.8513, ['Amer Fort', 'Amber Palace']),
  poi('jai_hawa_mahal', 'Hawa Mahal', 'scenic', 'Jaipur', 'Rajasthan', 26.9239, 75.8267, ['Palace of Winds', 'Hawa Mahal Jaipur']),
  poi('jai_city_palace', 'City Palace Jaipur', 'heritage', 'Jaipur', 'Rajasthan', 26.9258, 75.8236, ['City Palace', 'Jaipur Palace']),
  poi('jai_jantar_mantar', 'Jantar Mantar Jaipur', 'museum', 'Jaipur', 'Rajasthan', 26.9248, 75.8246, ['Jantar Mantar']),
  poi('jai_jal_mahal', 'Jal Mahal', 'scenic', 'Jaipur', 'Rajasthan', 26.9534, 75.8462, ['Water Palace Jaipur']),
  poi('jai_nahargarh', 'Nahargarh Fort', 'scenic', 'Jaipur', 'Rajasthan', 26.9373, 75.8155, ['Nahargarh Fort Jaipur']),
  poi('jai_albert_hall', 'Albert Hall Museum', 'museum', 'Jaipur', 'Rajasthan', 26.9117, 75.8195, ['Central Museum Jaipur', 'Albert Hall']),

  // ── GOA ──────────────────────────────────────────────────────────────────
  poi('goa_baga_beach', 'Baga Beach', 'beach', 'Goa', 'Goa', 15.5553, 73.7517, ['Baga']),
  poi('goa_calangute_beach', 'Calangute Beach', 'beach', 'Goa', 'Goa', 15.5439, 73.7553, ['Calangute']),
  poi('goa_fort_aguada', 'Fort Aguada', 'scenic', 'Goa', 'Goa', 15.4924, 73.7735, ['Aguada Fort', 'Aguada Lighthouse']),
  poi('goa_bom_jesus', 'Basilica of Bom Jesus', 'temple', 'Goa', 'Goa', 15.5009, 73.9116, ['Bom Jesus Basilica', 'Old Goa Church']),
  poi('goa_dudhsagar', 'Dudhsagar Falls', 'scenic', 'Goa', 'Goa', 15.3144, 74.3143, ['Dudhsagar Waterfalls']),
  poi('goa_anjuna_beach', 'Anjuna Beach', 'beach', 'Goa', 'Goa', 15.5752, 73.7405, ['Anjuna']),
  poi('goa_palolem_beach', 'Palolem Beach', 'beach', 'Goa', 'Goa', 15.0100, 74.0232, ['Palolem']),

  // ── CHENNAI ──────────────────────────────────────────────────────────────
  poi('chn_marina_beach', 'Marina Beach', 'beach', 'Chennai', 'Tamil Nadu', 13.0500, 80.2824, ['Marina Beach Chennai']),
  poi('chn_kapaleeshwarar', 'Kapaleeshwarar Temple', 'temple', 'Chennai', 'Tamil Nadu', 13.0336, 80.2699, ['Mylapore Kapaleeshwarar Temple', 'Kapaleeswarar']),
  poi('chn_san_thome', 'San Thome Basilica', 'temple', 'Chennai', 'Tamil Nadu', 13.0337, 80.2783, ['San Thome Church', 'Santhome Cathedral']),
  poi('chn_fort_st_george', 'Fort St George', 'heritage', 'Chennai', 'Tamil Nadu', 13.0797, 80.2874, ['Fort St. George', 'St George Fort']),
  poi('chn_govt_museum', 'Government Museum Chennai', 'museum', 'Chennai', 'Tamil Nadu', 13.0700, 80.2560, ['Madras Museum', 'Egmore Museum']),
  poi('chn_elliots_beach', 'Edward Elliot Beach', 'beach', 'Chennai', 'Tamil Nadu', 13.0003, 80.2696, ["Elliot's Beach", 'Besant Nagar Beach']),

  // ── KOLKATA ──────────────────────────────────────────────────────────────
  poi('kol_victoria_memorial', 'Victoria Memorial', 'monument', 'Kolkata', 'West Bengal', 22.5448, 88.3426, ['Victoria Memorial Hall', 'Victoria Memorial Kolkata']),
  poi('kol_howrah_bridge', 'Howrah Bridge', 'scenic', 'Kolkata', 'West Bengal', 22.5851, 88.3468, ['Rabindra Setu', 'Howrah Bridge Kolkata']),
  poi('kol_dakshineswar', 'Dakshineswar Kali Temple', 'temple', 'Kolkata', 'West Bengal', 22.6530, 88.3576, ['Dakshineswar Temple']),
  poi('kol_indian_museum', 'Indian Museum Kolkata', 'museum', 'Kolkata', 'West Bengal', 22.5579, 88.3511, ['Jadughar', 'Indian Museum']),
  poi('kol_st_paul_cathedral', "St. Paul's Cathedral", 'temple', 'Kolkata', 'West Bengal', 22.5441, 88.3468, ['St Paul Cathedral Kolkata']),
  poi('kol_science_city', 'Science City Kolkata', 'museum', 'Kolkata', 'West Bengal', 22.5401, 88.3963, ['Science City']),

  // ── PUNE ─────────────────────────────────────────────────────────────────
  poi('pun_shaniwar_wada', 'Shaniwar Wada', 'heritage', 'Pune', 'Maharashtra', 18.5196, 73.8553, ['Shaniwarwada Fort', 'Shaniwar Wada Pune']),
  poi('pun_aga_khan', 'Aga Khan Palace', 'heritage', 'Pune', 'Maharashtra', 18.5524, 73.9015, ['Aga Khan Palace Pune']),
  poi('pun_sinhagad_fort', 'Sinhagad Fort', 'scenic', 'Pune', 'Maharashtra', 18.3663, 73.7559, ['Sinhagarh Fort', 'Sinhagad']),
  poi('pun_dagdusheth', 'Shreemant Dagdusheth Halwai Ganpati Temple', 'temple', 'Pune', 'Maharashtra', 18.5164, 73.8560, ['Dagdusheth Halwai Ganpati', 'Dagdusheth Temple']),
  poi('pun_kelkar_museum', 'Raja Dinkar Kelkar Museum', 'museum', 'Pune', 'Maharashtra', 18.5108, 73.8542, ['Kelkar Museum']),
];

/** Quick index of golden POIs by city */
const GOLDEN_POIS_BY_CITY = new Map();
for (const p of GOLDEN_POIS) {
  const cityKey = p.city.toLowerCase().trim();
  if (!GOLDEN_POIS_BY_CITY.has(cityKey)) {
    GOLDEN_POIS_BY_CITY.set(cityKey, []);
  }
  GOLDEN_POIS_BY_CITY.get(cityKey).push(p);
}

/** Search golden POI by name or alias across all cities or within a city hint */
function findGoldenPoi(nameQuery, cityHint = null) {
  if (!nameQuery) return null;
  const q = String(nameQuery).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  if (!q) return null;

  const candidatePool = cityHint && GOLDEN_POIS_BY_CITY.has(cityHint.toLowerCase().trim())
    ? GOLDEN_POIS_BY_CITY.get(cityHint.toLowerCase().trim())
    : GOLDEN_POIS;

  // 1. Exact canonical name match
  for (const item of candidatePool) {
    const normName = item.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (normName === q) return item;
  }

  // 2. Exact alias match
  for (const item of candidatePool) {
    for (const alias of item.aliases) {
      const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      if (normAlias === q) return item;
    }
  }

  // 3. Substring / Token containment match (at least 2 matching words)
  const qWords = q.split(/\s+/).filter(w => w.length >= 3);
  let bestMatch = null;
  let bestScore = 0;

  for (const item of candidatePool) {
    const allNames = [item.canonicalName, ...item.aliases];
    for (const n of allNames) {
      const nWords = n.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
      let matchCount = 0;
      for (const qw of qWords) {
        if (nWords.includes(qw)) matchCount++;
      }
      if (matchCount >= 2 && matchCount > bestScore) {
        bestScore = matchCount;
        bestMatch = item;
      }
    }
  }

  return bestMatch;
}

module.exports = {
  GOLDEN_POIS,
  GOLDEN_POIS_BY_CITY,
  findGoldenPoi,
};
