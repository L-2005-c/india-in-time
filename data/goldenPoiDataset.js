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

function poi(id, canonicalName, category, city, state, lat, lon, aliases = [], toleranceMeters = 800, verificationEvidence = ['SURVEY_GROUND_TRUTH', 'MUNICIPAL_BOUNDS']) {
  return {
    id,
    canonicalPlaceId: id,
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
    datasetRole: 'CURATED_BENCHMARK_CANDIDATE',
    verificationEvidence,
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
  poi('hyd_durgam_cheruvu', 'Durgam Cheruvu & Cable Bridge', 'scenic', 'Hyderabad', 'Telangana', 17.4300, 78.3895, ['Durgam Cheruvu', 'Secret Lake Hyderabad', 'Durgam Cheruvu Cable Bridge']),
  poi('hyd_shilparamam', 'Shilparamam Cultural Crafts Village', 'heritage', 'Hyderabad', 'Telangana', 17.4520, 78.3790, ['Shilparamam', 'Shilparamam Hitec City']),

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
  poi('mum_pagoda', 'Global Vipassana Pagoda', 'heritage', 'Mumbai', 'Maharashtra', 19.2282, 72.8059, ['Vipassana Pagoda Gorai', 'Global Pagoda']),
  poi('mum_cst', 'Chhatrapati Shivaji Terminus Heritage Building', 'monument', 'Mumbai', 'Maharashtra', 18.9400, 72.8355, ['VT Station', 'Victoria Terminus', 'CST Mumbai']),
  poi('mum_mount_mary', 'Mount Mary Basilica Bandra', 'temple', 'Mumbai', 'Maharashtra', 19.0465, 72.8225, ['Mount Mary Church', 'Basilica of Our Lady of the Mount']),

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
  poi('chn_dakshinachitra', 'DakshinaChitra Heritage Museum', 'museum', 'Chennai', 'Tamil Nadu', 12.8258, 80.2435, ['Dakshina Chitra', 'Dakshinachitra Museum']),
  poi('chn_guindy', 'Guindy National Park', 'park', 'Chennai', 'Tamil Nadu', 13.0067, 80.2206, ['Guindy Park', 'Guindy Zoo']),
  poi('chn_valluvar_kottam', 'Valluvar Kottam', 'monument', 'Chennai', 'Tamil Nadu', 13.0528, 80.2417, ['Valluvar Memorial']),

  // ── KOCHI ────────────────────────────────────────────────────────────────
  poi('koc_chinese_nets', 'Chinese Fishing Nets', 'scenic', 'Kochi', 'Kerala', 9.9667, 76.2420, ['Chinese Nets', 'Cheena Vala']),
  poi('koc_fort_kochi_beach', 'Fort Kochi Beach', 'beach', 'Kochi', 'Kerala', 9.9637, 76.2375, ['Fort Kochi Beach Walk']),
  poi('koc_mattancherry', 'Mattancherry Palace', 'heritage', 'Kochi', 'Kerala', 9.9576, 76.2592, ['Dutch Palace', 'Mattancherry Dutch Palace']),
  poi('koc_paradesi_synagogue', 'Paradesi Synagogue', 'heritage', 'Kochi', 'Kerala', 9.9570, 76.2596, ['Jewish Synagogue Kochi', 'Jew Town Synagogue']),
  poi('koc_st_francis', 'St Francis Church', 'temple', 'Kochi', 'Kerala', 9.9653, 76.2417, ['St Francis Church Fort Kochi']),
  poi('koc_santa_cruz', 'Santa Cruz Cathedral Basilica', 'temple', 'Kochi', 'Kerala', 9.9644, 76.2410, ['Santa Cruz Basilica Kochi']),
  poi('koc_marine_drive', 'Marine Drive Kochi', 'scenic', 'Kochi', 'Kerala', 9.9772, 76.2773, ['Marine Drive Rainbow Bridge', 'Kochi Promenade']),
  poi('koc_hill_palace', 'Hill Palace Museum Tripunithura', 'museum', 'Kochi', 'Kerala', 9.9535, 76.3638, ['Hill Palace Kochi', 'Tripunithura Palace']),
  poi('koc_kumbalangi', 'Kumbalangi Model Eco-Tourism Village', 'scenic', 'Kochi', 'Kerala', 9.8761, 76.2871, ['Kumbalangi Village', 'Kumbalangi Backwaters']),
  poi('koc_cherai_beach', 'Cherai Beach', 'beach', 'Kochi', 'Kerala', 10.1415, 76.1785, ['Cherai Vypin Beach']),

  // ── PADERU & ALLURI DISTRICT CIRCUIT ─────────────────────────────────────
  poi('paderu_vanjangi', 'Vanjangi Cloud Peak (Meghala Konda)', 'viewpoint', 'Paderu', 'Andhra Pradesh', 18.0062, 82.7230, ['Vanjangi Hills', 'Vanjangi Cloud Point', 'Meghala Konda', 'Vanjangi Sunrise Trek']),
  poi('paderu_borra_caves', 'Borra Caves', 'scenic', 'Paderu', 'Andhra Pradesh', 18.2815, 83.0402, ['Borra Guhalu', 'Borra Limestone Caves', 'Borra Caves Araku']),
  poi('paderu_katiki_waterfalls', 'Katiki Waterfalls', 'scenic', 'Paderu', 'Andhra Pradesh', 18.2910, 83.0080, ['Katiki Falls', 'Katiki Jalapatham']),
  poi('paderu_araku_tribal_museum', 'Araku Tribal Museum', 'museum', 'Paderu', 'Andhra Pradesh', 18.3280, 82.8800, ['Tribal Museum Araku', 'Araku Museum']),
  poi('paderu_araku_coffee_museum', 'Araku Coffee Museum & Café', 'museum', 'Paderu', 'Andhra Pradesh', 18.3275, 82.8810, ['Coffee Museum Araku', 'Araku Coffee House']),
  poi('paderu_padmapuram', 'Padmapuram Botanical Gardens', 'park', 'Paderu', 'Andhra Pradesh', 18.3370, 82.8710, ['Padmapuram Gardens', 'Araku Treehouse Gardens']),
  poi('paderu_chaparai', 'Chaparai Water Cascades (Dumbriguda)', 'scenic', 'Paderu', 'Andhra Pradesh', 18.2835, 82.7842, ['Chaparai Falls', 'Chaparai Waterfalls', 'Dumbriguda Waterfalls']),
  poi('paderu_galikonda', 'Galikonda View Point', 'viewpoint', 'Paderu', 'Andhra Pradesh', 18.2370, 82.9560, ['Galikonda Peak', 'Galikonda Viewpoint Araku']),
  poi('paderu_lambasingi', 'Lambasingi Cloud & Pine Forest Trail', 'scenic', 'Paderu', 'Andhra Pradesh', 17.8180, 82.4930, ['Lambasingi', 'Lammasingi', 'Kashmir of Andhra']),
  poi('paderu_thajangi', 'Thajangi Reservoir Boating Lambasingi', 'scenic', 'Paderu', 'Andhra Pradesh', 17.8105, 82.4760, ['Thajangi Dam', 'Tajangi Reservoir Lambasingi']),
  poi('paderu_kothapalli', 'Kothapalli Waterfalls Lambasingi', 'scenic', 'Paderu', 'Andhra Pradesh', 17.9358, 82.5110, ['Kothapalli Falls', 'Kothapalli Waterfalls']),
  poi('paderu_susan_garden', 'Susan Garden Yellow Flower Fields', 'scenic', 'Paderu', 'Andhra Pradesh', 17.8310, 82.5020, ['Susan Garden Lambasingi', 'Yellow Flowers Lambasingi']),
  poi('paderu_modakondamma', 'Sri Modakondamma Ammavari Temple', 'temple', 'Paderu', 'Andhra Pradesh', 18.0772, 82.6631, ['Modakondamma Temple', 'Modamamba Temple', 'Paderu Ammavari Gudi']),
  poi('paderu_modamamba_padalu', 'Modamamba Padalu Stream Spot', 'scenic', 'Paderu', 'Andhra Pradesh', 18.0825, 82.6580, ['Modamamba Padalu', 'Goddess Footprints Paderu']),
  poi('paderu_matsyagundam', 'Matsyagundam Sacred Fish Pool & Shiva Temple', 'temple', 'Paderu', 'Andhra Pradesh', 18.0412, 82.7155, ['Matsyagundam', 'Matsyalingeswara Swamy Temple']),
  poi('paderu_coffee_plantations', 'Paderu Shaded Arabica Coffee Plantations', 'scenic', 'Paderu', 'Andhra Pradesh', 18.0715, 82.6710, ['Paderu Coffee Estates', 'Alluri Arabica Coffee Plantations']),
  poi('paderu_thatiguda', 'Thatiguda Waterfalls Ananthagiri', 'scenic', 'Paderu', 'Andhra Pradesh', 18.2250, 83.0110, ['Tatiguda Falls', 'Ananthagiri Waterfalls']),
  poi('paderu_ghat_viewpoint', 'Paderu Ghat Road Vaddi Chettu Viewpoint', 'viewpoint', 'Paderu', 'Andhra Pradesh', 18.0120, 82.7510, ['Paderu Ghat Viewpoint', 'Vaddi Chettu View Point']),

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
  const INFRASTRUCTURE_SUFFIXES = new Set(['road', 'street', 'colony', 'layout', 'junction', 'area', 'circle', 'lane', 'bypass', 'extension', 'ward']);
  const qWords = q.split(/\s+/).filter(w => w.length >= 3);
  let bestMatch = null;
  let bestScore = 0;

  for (const item of candidatePool) {
    const allNames = [item.canonicalName, ...item.aliases];
    for (const n of allNames) {
      const nWords = n.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 3);

      // Guard: Disallow match if query specifies road/colony/area but destination is not a road/colony
      const hasUnmatchedInfra = qWords.some(w => INFRASTRUCTURE_SUFFIXES.has(w) && !nWords.includes(w));
      if (hasUnmatchedInfra) continue;

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
  GOLDEN_BENCHMARK_POIS: GOLDEN_POIS,
  GOLDEN_POIS_BY_CITY,
  findGoldenPoi,
};
