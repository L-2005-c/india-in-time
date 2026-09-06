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
  entry('Kambalakonda Jungle Trek', 'trekking', 'S', 17.7795, 83.3355, ['kambalakonda trek']),
  entry('Simhachalam Hill Pavani Trail', 'trekking', 'A', 17.7680, 83.2520, ['simhachalam trek']),
  entry('Vanjangi Cloud Peak Trek', 'trekking', 'S', 18.0062, 82.7230, ['vanjangi trek', 'meghala konda']),
  entry('Katiki Waterfalls Jungle Trail', 'trekking', 'A', 18.2910, 83.0080, ['katiki trek']),
  entry('Yarada Dolphin Ridge Hike', 'trekking', 'B', 17.6560, 83.2710, ['dolphin ridge trek']),
];

const HYDERABAD = [
  entry('Charminar', 'scenic', 'S', 17.3616, 78.4747),
  entry('Golconda Fort', 'scenic', 'S', 17.3833, 78.4011, ['golkonda fort']),
  entry('Salar Jung Museum', 'museum', 'S', 17.3713, 78.4804),
  entry('Hussain Sagar', 'scenic', 'A', 17.4239, 78.4738, ['tank bund', 'hussain sagar lake']),
  entry('Ramoji Film City', 'entertainment', 'A', 17.2543, 78.6808, ['ramoji']),
  entry('Chowmahalla Palace', 'heritage', 'A', 17.3578, 78.4717),
  entry('Birla Mandir Hyderabad', 'temple', 'A', 17.4062, 78.4691, ['birla mandir']),
  entry('Qutb Shahi Tombs', 'heritage', 'A', 17.3894, 78.3962, ['seven tombs']),
  entry('Nehru Zoological Park', 'zoo', 'A', 17.3508, 78.4516, ['hyderabad zoo']),
  entry('Durgam Cheruvu & Cable Bridge', 'scenic', 'A', 17.4300, 78.3895, ['durgam cheruvu', 'secret lake']),
  entry('Shilparamam Cultural Crafts Village', 'heritage', 'A', 17.4520, 78.3790, ['shilparamam']),
  entry('Inorbit Mall Hyderabad', 'shopping', 'A', 17.4337, 78.3862, ['inorbit mall hyderabad']),
  entry('GVK One Mall', 'shopping', 'A', 17.4193, 78.4482, ['gvk one']),
  entry('Khajaguda Hills Cave & Bouldering Trail', 'trekking', 'A', 17.4140, 78.3610, ['khajaguda trek']),
  entry('Ananthagiri Hills Vikarabad Forest Trek', 'trekking', 'A', 17.3110, 77.8650, ['ananthagiri trek']),
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
  entry('Dudhsagar Jungle Railway Trek', 'trekking', 'S', 15.3144, 74.3143, ['dudhsagar trek']),
  entry('Tambdi Surla Waterfall Trek', 'trekking', 'A', 15.4410, 74.2560, ['tambdi surla trek']),
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
  entry('Nahargarh Fort Hilltop Trek', 'trekking', 'A', 26.9402, 75.8170, ['nahargarh trek']),
  entry('Hathni Kund Hidden Valley Trek', 'trekking', 'A', 26.9620, 75.8450, ['hathni kund trek']),
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
  entry('Asola Bhatti Wildlife Sanctuary Ridge Trail', 'trekking', 'A', 28.4680, 77.2620, ['asola bhatti trek']),
  entry('Aravalli Biodiversity Park Nature Trail', 'trekking', 'A', 28.4890, 77.0980, ['aravalli trail']),
];

const MUMBAI = [
  entry('Gateway of India', 'scenic', 'S', 18.9220, 72.8347),
  entry('Marine Drive', 'scenic', 'S', 18.9432, 72.8236, ['queens necklace']),
  entry('Chhatrapati Shivaji Maharaj Vastu Sangrahalaya', 'museum', 'S', 18.9269, 72.8327, ['csmvs', 'prince of wales museum']),
  entry('Elephanta Caves', 'heritage', 'S', 18.9633, 72.9315),
  entry('Haji Ali Dargah', 'temple', 'A', 18.9827, 72.8089),
  entry('Siddhivinayak Temple', 'temple', 'A', 19.0169, 72.8309),
  entry('Juhu Beach', 'beach', 'A', 19.0996, 72.8258),
  entry('Bandra Fort (Castella de Aguada)', 'scenic', 'A', 19.0416, 72.8184, ['bandra fort']),
  entry('Global Vipassana Pagoda', 'heritage', 'A', 19.2282, 72.8059, ['vipassana pagoda']),
  entry('Girgaon Chowpatty Beach', 'beach', 'B', 18.9545, 72.8130, ['chowpatty']),
  entry('Phoenix Palladium', 'shopping', 'A', 18.9942, 72.8250, ['phoenix mall mumbai']),
  entry('High Street Phoenix', 'shopping', 'A', 18.9940, 72.8245),
  entry('Sanjay Gandhi National Park Kanheri Caves Trek', 'trekking', 'A', 19.2060, 72.9060, ['kanheri caves trek']),
  entry('Karnala Fort & Bird Sanctuary Trek', 'trekking', 'A', 18.8890, 73.1200, ['karnala trek']),
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
  entry('Nandi Hills Sunrise & Heritage Steps Trek', 'trekking', 'S', 13.3702, 77.6835, ['nandi hills trek']),
  entry('Skandagiri Peak Sunrise Trek', 'trekking', 'S', 13.4180, 77.6830, ['skandagiri trek']),
  entry('Savandurga Monolith Hill Climb', 'trekking', 'A', 12.9190, 77.2930, ['savandurga trek']),
];

const KOCHI = [
  entry('Fort Kochi Beach', 'beach', 'A', 9.9658, 76.2421),
  entry('Chinese Fishing Nets', 'scenic', 'S', 9.9681, 76.2441, ['chinese nets', 'cheena vala']),
  entry('Mattancherry Palace', 'heritage', 'A', 9.9580, 76.2595, ['dutch palace']),
  entry('St Francis Church Kochi', 'temple', 'A', 9.9659, 76.2411, ['st francis church']),
  entry('Santa Cruz Cathedral Basilica', 'temple', 'A', 9.9644, 76.2410, ['santa cruz basilica']),
  entry('Jewish Synagogue Kochi', 'heritage', 'A', 9.9575, 76.2595, ['pardesi synagogue', 'jewish synagogue']),
  entry('Marine Drive Kochi', 'scenic', 'A', 9.9816, 76.2754),
  entry('Hill Palace Museum Tripunithura', 'museum', 'A', 9.9535, 76.3638, ['hill palace kochi']),
  entry('Kumbalangi Model Eco-Tourism Village', 'scenic', 'A', 9.8761, 76.2871, ['kumbalangi']),
  entry('Cherai Beach & Sunset Point', 'beach', 'A', 10.1415, 76.1785, ['cherai beach']),
  entry('Lulu Mall Kochi', 'shopping', 'A', 10.0272, 76.3081, ['lulu mall']),
];

const CHENNAI = [
  entry('Marina Beach', 'beach', 'S', 13.0500, 80.2824, ['marina beach chennai']),
  entry('Kapaleeshwarar Temple', 'temple', 'S', 13.0336, 80.2699, ['kapaleeswarar temple', 'mylapore temple']),
  entry('San Thome Basilica', 'temple', 'A', 13.0337, 80.2783, ['san thome church', 'santhome cathedral']),
  entry('Fort St George', 'heritage', 'A', 13.0797, 80.2874, ['fort st. george']),
  entry('Government Museum Chennai', 'museum', 'S', 13.0700, 80.2560, ['egmore museum', 'madras museum']),
  entry('Edward Elliot Beach (Besant Nagar)', 'beach', 'A', 13.0003, 80.2696, ['elliots beach', 'besant nagar beach']),
  entry('Guindy National Park', 'park', 'A', 13.0067, 80.2206, ['guindy park']),
  entry('Valluvar Kottam', 'monument', 'A', 13.0528, 80.2417, ['valluvar memorial']),
  entry('Parthasarathy Temple Triplicane', 'temple', 'A', 13.0538, 80.2764, ['triplicane temple']),
  entry('Semmozhi Poonga Botanical Garden', 'park', 'B', 13.0489, 80.2508, ['semmozhi poonga']),
  entry('DakshinaChitra Heritage Museum', 'museum', 'S', 12.8258, 80.2435, ['dakshina chitra']),
  entry('Theosophical Society Adyar Gardens', 'park', 'A', 13.0102, 80.2592, ['adyar gardens']),
  entry('Express Avenue Mall', 'shopping', 'A', 13.0594, 80.2642, ['express avenue']),
  entry('Phoenix Marketcity Chennai', 'shopping', 'A', 12.9918, 80.2170, ['phoenix marketcity chennai']),
  entry('T. Nagar Ranganathan Street Bazaar', 'shopping', 'A', 13.0405, 80.2337, ['ranganathan street']),
];

const PADERU = [
  entry('Vanjangi Cloud Peak (Meghala Konda)', 'viewpoint', 'S', 18.0062, 82.7230, ['vanjangi', 'vanjangi hills', 'meghala konda', 'vanjangi cloud peak', 'vanjangi trek']),
  entry('Borra Caves', 'scenic', 'S', 18.2815, 83.0402, ['borra guhalu', 'borra caves araku', 'borra limestone caves']),
  entry('Katiki Waterfalls', 'scenic', 'A', 18.2910, 83.0080, ['katiki falls', 'katiki', 'katiki trek']),
  entry('Araku Tribal Museum', 'museum', 'A', 18.3280, 82.8800, ['tribal museum araku', 'araku museum']),
  entry('Araku Coffee Museum & Café', 'museum', 'A', 18.3275, 82.8810, ['coffee museum araku', 'araku coffee house']),
  entry('Padmapuram Botanical Gardens', 'park', 'B', 18.3370, 82.8710, ['padmapuram gardens']),
  entry('Chaparai Water Cascades (Dumbriguda)', 'scenic', 'A', 18.2835, 82.7842, ['chaparai falls', 'chaparai waterfalls', 'dumbriguda waterfalls']),
  entry('Galikonda View Point', 'viewpoint', 'A', 18.2370, 82.9560, ['galikonda viewpoint', 'galikonda peak']),
  entry('Lambasingi Cloud & Pine Forest Trail', 'scenic', 'S', 17.8180, 82.4930, ['lambasingi', 'lammasingi', 'kashmir of andhra', 'lambasingi trek']),
  entry('Thajangi Reservoir Boating Lambasingi', 'scenic', 'A', 17.8105, 82.4760, ['thajangi dam', 'tajangi reservoir']),
  entry('Kothapalli Waterfalls Lambasingi', 'scenic', 'A', 17.9358, 82.5110, ['kothapalli falls', 'kothapalli waterfalls']),
  entry('Susan Garden Yellow Flower Fields', 'scenic', 'B', 17.8310, 82.5020, ['susan garden', 'susan garden lambasingi']),
  entry('Sri Modakondamma Ammavari Temple', 'temple', 'S', 18.0772, 82.6631, ['modakondamma temple', 'modamamba temple', 'paderu ammavari gudi']),
  entry('Modamamba Padalu Stream Spot', 'scenic', 'A', 18.0825, 82.6580, ['modamamba padalu', 'goddess footprints paderu']),
  entry('Matsyagundam Sacred Fish Pool & Shiva Temple', 'temple', 'A', 18.0412, 82.7155, ['matsyagundam', 'matsyalingeswara swamy temple']),
  entry('Paderu Shaded Arabica Coffee Plantations', 'scenic', 'A', 18.0715, 82.6710, ['paderu coffee estates', 'alluri coffee plantations']),
  entry('Ananthagiri Coffee Plantations & Viewpoint', 'scenic', 'A', 18.2577, 82.9893, ['ananthagiri viewpoint', 'ananthagiri coffee']),
  entry('Thatiguda Waterfalls Ananthagiri', 'scenic', 'B', 18.2250, 83.0110, ['tatiguda falls', 'thatiguda waterfalls']),
  entry('Paderu Ghat Road Vaddi Chettu Viewpoint', 'viewpoint', 'B', 18.0120, 82.7510, ['paderu ghat viewpoint', 'vaddi chettu view point']),
  entry('Paderu Weekly Tribal Haat & Artisan Santha', 'shopping', 'B', 18.0790, 82.6625, ['paderu haat', 'paderu tribal santha']),
  entry('Bongu Kodi Bamboo Chicken Center Paderu', 'food', 'B', 18.0782, 82.6640, ['bamboo chicken paderu', 'bongu kodi paderu']),
  entry('Araku Bamboo Chicken & Spice Hub', 'food', 'B', 18.3290, 82.8790, ['araku bamboo chicken']),
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

const TIRUPATI = [
  entry('Tirumala Venkateswara Temple', 'temple', 'S', 13.6833, 79.3472, ['tirumala temple', 'balaji temple', 'lord venkateswara']),
  entry('Sri Padmavathi Ammavari Temple (Tiruchanur)', 'temple', 'S', 13.6068, 79.4475, ['padmavathi temple', 'tiruchanur temple']),
  entry('Sri Govindaraja Swamy Temple', 'temple', 'A', 13.6298, 79.4180, ['govindaraja swamy temple']),
  entry('Kapila Theertham & Sacred Waterfall', 'temple', 'A', 13.6520, 79.4192, ['kapila theertham']),
  entry('Sri Srikalahasti Temple (Rahu Kethu Kshetram)', 'temple', 'S', 13.7498, 79.6984, ['srikalahasti temple']),
  entry('Chandragiri Fort & Raja Mahal Sound Light Show', 'heritage', 'A', 13.5833, 79.3167, ['chandragiri fort']),
  entry('Silathoranam Natural Rock Arch Tirumala', 'scenic', 'A', 13.6912, 79.3510, ['silathoranam']),
  entry('Chakra Theertham Tirumala', 'scenic', 'B', 13.6885, 79.3412, ['chakra theertham']),
  entry('Papavinasam Theertham & Dam', 'scenic', 'B', 13.7150, 79.3490, ['papavinasam']),
  entry('Akasa Ganga Waterfall Tirumala', 'scenic', 'B', 13.7080, 79.3520, ['akasa ganga']),
  entry('Talakona Waterfalls & Bio-Reserve', 'scenic', 'S', 13.8050, 79.2150, ['talakona falls', 'talakona']),
  entry('Alipiri Footpath 3550 Steps Sacred Trek', 'trekking', 'A', 13.6620, 79.3800, ['alipiri steps', 'alipiri footpath']),
  entry('Srivari Mettu 2388 Steps Ancient Trek', 'trekking', 'A', 13.6580, 79.3150, ['srivari mettu']),
  entry('Bhimas Deluxe Heritage Restaurant', 'food', 'A', 13.6275, 79.4210, ['bhimas tirupati']),
  entry('Tirupati Laddu Complex Prasadam Counter', 'food', 'S', 13.6830, 79.3480, ['tirupati laddu']),
];

const VIJAYAWADA = [
  entry('Sri Durga Malleswara Swamy Varla Devasthanam (Kanaka Durga)', 'temple', 'S', 16.5165, 80.6095, ['kanaka durga temple', 'durga temple vijayawada', 'indrakeeladri']),
  entry('Prakasam Barrage & Riverfront Promenade', 'scenic', 'S', 16.5085, 80.6070, ['prakasam barrage']),
  entry('Bhavani Island & Water Sports Park', 'park', 'A', 16.5250, 80.5850, ['bhavani island']),
  entry('Undavalli Caves Rock-Cut Architecture', 'heritage', 'S', 16.4967, 80.5802, ['undavalli caves']),
  entry('Mogalarajapuram Caves (Ardhanariswara)', 'heritage', 'B', 16.5050, 80.6480, ['mogalarajapuram caves']),
  entry('Bapu Museum (Victoria Jubilee Hall)', 'museum', 'A', 16.5130, 80.6320, ['bapu museum']),
  entry('Kondapalli Fort & Heritage Ramparts', 'heritage', 'A', 16.6210, 80.5420, ['kondapalli fort']),
  entry('Kondapalli Toy Village Crafts Center', 'shopping', 'A', 16.6180, 80.5400, ['kondapalli toys']),
  entry('Mangalagiri Panakala Lakshmi Narasimha Swamy Temple', 'temple', 'A', 16.4350, 80.5620, ['mangalagiri temple']),
  entry('Babai Hotel Heritage Ghee Idli', 'food', 'A', 16.5170, 80.6190, ['babai hotel']),
];

const MYSORE = [
  entry('Mysore Palace (Amba Vilas Palace)', 'heritage', 'S', 12.3051, 76.6551, ['amba vilas palace', 'mysuru palace', 'mysore palace']),
  entry('Chamundi Hill & Sri Chamundeshwari Temple', 'temple', 'S', 12.2753, 76.6701, ['chamundi hill', 'chamundeshwari temple', 'chamundi betta']),
  entry('Brindavan Gardens & Musical Dancing Fountain', 'park', 'S', 12.4228, 76.5724, ['brindavan gardens', 'krs dam gardens']),
  entry("St. Philomena's Cathedral", 'temple', 'A', 12.3208, 76.6579, ['st philomena church mysore', 'st philomenas cathedral']),
  entry('Sri Chamarajendra Zoological Gardens (Mysore Zoo)', 'zoo', 'S', 12.3025, 76.6645, ['mysore zoo', 'chamarajendra zoo']),
  entry('Ranganathittu Bird Sanctuary & Boating', 'wildlife', 'S', 12.4245, 76.6550, ['ranganathittu bird sanctuary', 'pakshi kashi']),
  entry('Srirangapatna Sri Ranganathaswamy Temple', 'temple', 'A', 12.4230, 76.6950, ['srirangapatna temple', 'ranganathaswamy temple']),
  entry('Jaganmohan Palace & Art Gallery', 'museum', 'A', 12.3080, 76.6505, ['jaganmohan palace']),
  entry('Karanji Lake & Nature Butterfly Park', 'park', 'A', 12.3060, 76.6740, ['karanji lake']),
  entry('Devaraja Heritage Spices & Flower Market', 'shopping', 'A', 12.3115, 76.6515, ['devaraja market']),
  entry('Guru Sweet Mart Original Mysore Pak', 'food', 'A', 12.3090, 76.6520, ['guru sweet mart', 'mysore pak guru sweets']),
];

const MUNNAR = [
  entry('Eravikulam National Park (Nilgiri Tahr)', 'wildlife', 'S', 10.1500, 77.0600, ['eravikulam national park', 'rajamalai']),
  entry('Mattupetty Dam & Lake Speed Boating', 'scenic', 'S', 10.1080, 77.1250, ['mattupetty dam', 'mattupetti lake']),
  entry('Top Station Cloud Viewpoint', 'viewpoint', 'S', 10.1245, 77.2440, ['top station', 'top station munnar']),
  entry('Tata Tea Museum Nallathanni Estate', 'museum', 'S', 10.0880, 77.0540, ['tea museum munnar', 'tata tea museum']),
  entry('Kundala Dam Lake & Shikara Rides', 'scenic', 'A', 10.1280, 77.1720, ['kundala lake', 'kundala arch dam']),
  entry('Kolukkumalai Highest Organic Tea Estate', 'scenic', 'S', 10.0930, 77.2280, ['kolukkumalai tea estate', 'kolukkumalai sunrise point']),
  entry('Attukad Waterfalls Mountain Cascades', 'scenic', 'A', 10.0480, 77.0420, ['attukad falls', 'attukal waterfalls']),
  entry('Pothamedu View Point (Tea & Cardamom Hills)', 'viewpoint', 'A', 10.0570, 77.0520, ['pothamedu viewpoint']),
  entry('Chokramudi Peak Sunrise Ridge Trek', 'trekking', 'S', 10.0410, 77.0850, ['chokramudi trek']),
  entry('Meesapulimala Mountain Cloud Ridge Trek', 'trekking', 'S', 10.0980, 77.2050, ['meesapulimala trek']),
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
  chennai: CHENNAI,
  madras: CHENNAI,
  paderu: PADERU,
  araku: PADERU,
  lambasingi: PADERU,
  vanjangi: PADERU,
  tirupati: TIRUPATI,
  tirumala: TIRUPATI,
  vijayawada: VIJAYAWADA,
  bezawada: VIJAYAWADA,
  agra: AGRA,
  varanasi: VARANASI,
  benares: VARANASI,
  kolkata: KOLKATA,
  calcutta: KOLKATA,
  mysore: MYSORE,
  mysuru: MYSORE,
  munnar: MUNNAR,
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

    const INFRA_WORDS = /\b(road|rd|street|colony|layout|junction|area|circle|lane|bypass|extension|ward)\b/i;
    const hasInfraInQuery = INFRA_WORDS.test(name);

    for (const e of index.entries) {
      const en = e.name.toLowerCase();
      if (hasInfraInQuery && !INFRA_WORDS.test(en)) continue;
      if (en.length >= 6 && (name.includes(en) || en.includes(name))) return e;
      for (const a of e.aliases || []) {
        if (hasInfraInQuery && !INFRA_WORDS.test(a)) continue;
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

function isWhitelistedTourismPoi(name, cityHint = null) {
  return resolveWhitelist({ name }, cityHint) !== null;
}

module.exports = {
  VIZAG_WHITELIST,
  CITY_WHITELISTS,
  resolveWhitelist,
  isWhitelistedTourismPoi,
  isVerifiedShoppingDestination,
  SHOPPING_DESTINATION_NAMES,
  getCityWhitelist,
  listSupportedCities,
};
