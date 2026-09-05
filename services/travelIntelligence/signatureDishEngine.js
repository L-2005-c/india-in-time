// services/travelIntelligence/signatureDishEngine.js
// Curates iconic signature dishes and legendary micro-local food spots situated within 50m–300m of Indian attractions.
'use strict';

const SIGNATURE_DISH_REGISTRY = {
  // Hyderabad
  charminar: {
    dishName: 'Irani Chai & Osmania Biscuits',
    iconicSpot: 'Nimrah Cafe & Bakery (directly facing Charminar gate)',
    distanceM: 35,
    isVeg: true,
    priceRange: '₹20–₹50',
    mustTryReason: 'Dip warm buttery Osmania biscuits into authentic steaming Irani dum chai while watching the minarets.',
  },
  golconda_fort: {
    dishName: 'Resham Handi Biryani & Mirchi Ka Salan',
    iconicSpot: 'Hotel Rumaan / Golconda Heritage Kebab Court',
    distanceM: 180,
    isVeg: false,
    priceRange: '₹150–₹280',
    mustTryReason: 'Traditional slow-cooked firewood biryani with authentic Hyderabadi spice blend.',
  },
  salar_jung_museum: {
    dishName: 'Haleem & Paya Nahari',
    iconicSpot: 'Nayab Hotel (near Nayapul bridge)',
    distanceM: 250,
    isVeg: false,
    priceRange: '₹120–₹240',
    mustTryReason: 'Legendary morning Nahari with soft Char Koni Naan, operational since 1953.',
  },
  birla_mandir: {
    dishName: 'Ghee Podi Idli & Filter Coffee',
    iconicSpot: 'Minerva Coffee Shop / Taj Mahal Hotel Himayatnagar',
    distanceM: 350,
    isVeg: true,
    priceRange: '₹80–₹160',
    mustTryReason: 'Melt-in-mouth button idlis drenched in pure cow ghee and gun powder podi.',
  },
  hussain_sagar_lake: {
    dishName: 'Masala Pav Bhaji & Kulfi Falooda',
    iconicSpot: 'Eat Street Promenade',
    distanceM: 50,
    isVeg: true,
    priceRange: '₹90–₹180',
    mustTryReason: 'Breezy lakeside evening pav bhaji with rich saffron rabdi kulfi.',
  },

  // Visakhapatnam (Vizag)
  ramakrishna_beach: {
    dishName: 'Hot Muri Mixture & Andhra Mirchi Bajji',
    iconicSpot: 'RK Beach Street Carts (near Kali Temple & Submarine)',
    distanceM: 30,
    isVeg: true,
    priceRange: '₹30–₹60',
    mustTryReason: 'Tangy puffed rice with roasted peanuts, lemon, onion, and crispy besan stuffed green chilli fritters by the waves.',
  },
  simhachalam: {
    dishName: 'Simhachalam Appalu Prasadam & Punugulu',
    iconicSpot: 'Devasthanam Prasadam Counter & Hilltop Vendors',
    distanceM: 40,
    isVeg: true,
    priceRange: '₹20–₹50',
    mustTryReason: 'Crisp golden jaggery-infused sweet appalu blessed at the 11th-century Narasimha shrine.',
  },
  kailasagiri: {
    dishName: 'Bamboo Chicken & Filter Kaapi',
    iconicSpot: 'Hilltop Viewpoint Food Kiosks',
    distanceM: 60,
    isVeg: false,
    priceRange: '₹120–₹220',
    mustTryReason: 'Spicy marinated chicken roasted inside fresh green bamboo stalks with panoramic Bay of Bengal views.',
  },
  rushikonda_beach: {
    dishName: 'Prawn Fry & Fresh Coconut Water',
    iconicSpot: 'Rushikonda Beach Shack Food Plaza',
    distanceM: 45,
    isVeg: false,
    priceRange: '₹150–₹300',
    mustTryReason: 'Catch-of-the-day Andhra spiced coastal sea prawns fried with curry leaves.',
  },
  ins_kursura_submarine: {
    dishName: 'Guntur Karampodi Dosa',
    iconicSpot: 'Venkatadri Vantillu / Beach Food Walk',
    distanceM: 120,
    isVeg: true,
    priceRange: '₹70–₹130',
    mustTryReason: 'Ghee roast dosa smeared with flaming red Andhra spice paste and peanut chutney.',
  },

  // Paderu & Alluri Circuit
  paderu_bamboo_chicken: {
    dishName: 'Authentic Forest Bongu Kodi (Bamboo Chicken)',
    iconicSpot: 'Paderu Main Road Tribal Food Hubs & Modakondamma Junction',
    distanceM: 50,
    isVeg: false,
    priceRange: '₹140–₹240',
    mustTryReason: 'Wild country chicken seasoned with local mountain herbs and woodfire-cooked inside green bamboo culms with zero added oil.',
  },
  vanjangi_cloud_peak: {
    dishName: 'Woodfire Ginger Tea & Roasted Sweet Corn',
    iconicSpot: 'Vanjangi Sunrise Trek Trailhead Kiosks',
    distanceM: 30,
    isVeg: true,
    priceRange: '₹20–₹50',
    mustTryReason: 'Steaming ginger-infused mountain tea enjoyed while watching sunrise cloud inversion over Meghala Konda.',
  },
  borra_caves: {
    dishName: 'Araku Bamboo Chicken & Dum Tea',
    iconicSpot: 'Borra Caves Entrance Food Court',
    distanceM: 40,
    isVeg: false,
    priceRange: '₹120–₹220',
    mustTryReason: 'Freshly roasted tribal bamboo chicken cooked on open firewood outside the million-year-old caves.',
  },
  araku_coffee_museum: {
    dishName: 'Pure Araku Valley Organic Arabica Filter Coffee & Coffee Chocolates',
    iconicSpot: 'Araku Coffee Museum Cafe',
    distanceM: 20,
    isVeg: true,
    priceRange: '₹40–₹120',
    mustTryReason: 'World-renowned GI-tagged shade-grown tribal Arabica coffee brewed fresh.',
  },
  lambasingi: {
    dishName: 'Organic Strawberries & Pine Honey Tea',
    iconicSpot: 'Lambasingi Orchard Shacks & Susan Garden Trail',
    distanceM: 60,
    isVeg: true,
    priceRange: '₹50–₹100',
    mustTryReason: 'Fresh cold-climate strawberries picked straight from Eastern Ghat orchards with tribal wild blossom honey.',
  },
  modakondamma_temple: {
    dishName: 'Modakondamma Bellam Appalu & Paderu Ragi Sankati',
    iconicSpot: 'Temple Devasthanam Prasadam & Paderu Mess',
    distanceM: 40,
    isVeg: true,
    priceRange: '₹20–₹60',
    mustTryReason: 'Sacred jaggery prasad and nutritious mountain finger-millet sankati with spicy ginger chutney.',
  },

  // Chennai
  kapaleeshwarar: {
    dishName: 'Mylapore Degree Filter Coffee & Crispy Medu Vada',
    iconicSpot: "Rayar's Mess & Mami Tiffen Stall Mylapore",
    distanceM: 80,
    isVeg: true,
    priceRange: '₹30–₹70',
    mustTryReason: 'Frothy brass-davarah chicory-infused filter kaapi paired with golden crispy medu vadas.',
  },
  marina_beach_chennai: {
    dishName: 'Thengai Manga Pattani Sundal & Murukku Sandwich',
    iconicSpot: 'Marina Beach Stalls (near Gandhi Statue)',
    distanceM: 30,
    isVeg: true,
    priceRange: '₹25–₹60',
    mustTryReason: 'Warm spiced chickpea sundal tossed with raw mango shavings and fresh grated coconut by the waves.',
  },

  // Kochi
  chinese_fishing_nets: {
    dishName: 'Karimeen Pollichathu & Toddy Shop Fish Curry',
    iconicSpot: 'Fort Kochi Seafood Shacks & Seaside Grills',
    distanceM: 50,
    isVeg: false,
    priceRange: '₹200–₹450',
    mustTryReason: 'Fresh pearl spot fish marinated in shallot-chilli masala and slow-roasted wrapped inside a green banana leaf.',
  },

  // Varanasi
  varanasi_ghats: {
    dishName: 'Tamatar Chaat & Malaiyo / Blue Lassi',
    iconicSpot: 'Kashi Chaat Bhandar (Godowlia) & Blue Lassi Shop (Manikarnika)',
    distanceM: 110,
    isVeg: true,
    priceRange: '₹40–₹90',
    mustTryReason: 'Warm spiced mashed tomato gravy cooked in desi ghee, topped with crisp namakpare and sugar syrup.',
  },
  kashi_vishwanath: {
    dishName: 'Banarasi Kachori Jalebi & Thandai',
    iconicSpot: 'Ram Bhandar (Thatheri Bazar) & Baba Thandai',
    distanceM: 140,
    isVeg: true,
    priceRange: '₹40–₹80',
    mustTryReason: 'Crisp urad dal kachori with spicy chana curry and piping hot saffron spiral jalebis.',
  },

  // Jaipur
  hawa_mahal: {
    dishName: 'Pyaaz Kachori & Saffron Ghewar',
    iconicSpot: 'LMB (Laxmi Mishthan Bhandar) & Wind View Cafe rooftop',
    distanceM: 70,
    isVeg: true,
    priceRange: '₹50–₹150',
    mustTryReason: 'Flaky deep-fried pastry bursting with caramelized spicy onion filling.',
  },
  amber_fort: {
    dishName: 'Dal Baati Churma & Kesar Chai',
    iconicSpot: '1135 AD Heritage Courtyard / Surajpol Street Kiosks',
    distanceM: 90,
    isVeg: true,
    priceRange: '₹120–₹450',
    mustTryReason: 'Fire-baked wheat balls dunked in melted ghee, served with five-lentil Panchmel dal and sweet churma.',
  },
  city_palace_jaipur: {
    dishName: 'Mirchi Vada & Lassi in Earthen Kulhad',
    iconicSpot: 'Lassiwala (MI Road - Shop 312 since 1944)',
    distanceM: 280,
    isVeg: true,
    priceRange: '₹40–₹80',
    mustTryReason: 'Thick, creamy yogurt drink topped with a thick layer of malai in terracotta cups.',
  },

  // Amritsar
  golden_temple: {
    dishName: 'Amritsari Kulcha & Guru Ka Langar',
    iconicSpot: 'Bhai Kulwant Singh Kulchian Wale & Langar Hall',
    distanceM: 80,
    isVeg: true,
    priceRange: '₹0–₹80',
    mustTryReason: 'Crisp layered tandoori bread stuffed with spiced potato and paneer, served with spicy chole and tamarind-onion chutney.',
  },

  // Delhi
  red_fort: {
    dishName: 'Old Delhi Jalebi & Rabri with Dahi Bhalla',
    iconicSpot: 'Old Famous Jalebi Wala (Dariba Kalan corner, Chandni Chowk)',
    distanceM: 160,
    isVeg: true,
    priceRange: '₹50–₹120',
    mustTryReason: 'Giant thick jalebis fried in pure desi ghee soaked in saffron syrup, served with creamy rabri since 1884.',
  },
  qutub_minar: {
    dishName: 'Kakori Kebabs & Roomali Roti',
    iconicSpot: 'Mehrauli Heritage Food Walk / Olive Bistro Court',
    distanceM: 220,
    isVeg: false,
    priceRange: '₹180–₹380',
    mustTryReason: 'Silky smooth melt-in-mouth Awadhi spiced kebabs with paper-thin flatbread.',
  },

  // Mumbai
  gateway_of_india: {
    dishName: 'Bun Maska, Mutton Pattice & Irani Chai',
    iconicSpot: 'Cafe Leopold / Kyani & Co. / BadeMiya',
    distanceM: 150,
    isVeg: false,
    priceRange: '₹70–₹250',
    mustTryReason: 'Iconic Colaba culinary heritage since 1871.',
  },
  marine_drive: {
    dishName: 'Chowpatty Bhelpuri & Kulfi Ice Cream',
    iconicSpot: 'Girgaon Chowpatty Food Plaza',
    distanceM: 50,
    isVeg: true,
    priceRange: '₹50–₹110',
    mustTryReason: 'Zesty puffed rice tossed with raw mango, tamarind chutney, and fine sev alongside the sea breeze.',
  },

  // Goa
  baga_beach: {
    dishName: 'Goan Fish Curry Thali & Bebinca',
    iconicSpot: 'Britto’s Beach Shack & Souza Lobo',
    distanceM: 40,
    isVeg: false,
    priceRange: '₹220–₹450',
    mustTryReason: 'Tangy coconut-kokum kingfish curry with red rice, followed by 7-layered traditional Goan coconut pudding.',
  },
  fort_aguada: {
    dishName: 'Prawn Balchão & Feni Cocktail / Fresh Tender Coconut',
    iconicSpot: 'Sinquerim Cliffside Shacks',
    distanceM: 120,
    isVeg: false,
    priceRange: '₹180–₹350',
    mustTryReason: 'Fiery Portuguese-Goan spiced prawn pickle preparation overlooking the lighthouse.',
  },
  // Tirupati
  tirumala: {
    dishName: 'Authentic TTD Srivari Laddu Prasadam & Pulihora',
    iconicSpot: 'TTD Laddu Complex / Annaprasadam Complex Tirumala',
    distanceM: 50,
    isVeg: true,
    priceRange: '₹50–₹100',
    mustTryReason: 'The world-renowned GI-tagged Tirupati Laddu prepared with pure cow ghee, cashew nuts, raisins, and green cardamom.',
  },
  chandragiri_fort: {
    dishName: 'Rayalaseema Ragi Mudda with Natu Kodi Pulusu / Ghee Sambar',
    iconicSpot: 'Bhimas Deluxe / Chandragiri Highway Dhabas',
    distanceM: 150,
    isVeg: false,
    priceRange: '₹140–₹280',
    mustTryReason: 'Wholesome finger millet balls paired with spicy Rayalaseema country chicken gravy or thick ghee sambar.',
  },
  // Vijayawada
  kanaka_durga: {
    dishName: 'Babai Hotel Ghee Idli & Filter Coffee with Daddojanam',
    iconicSpot: 'Babai Hotel (Gandhinagar, est. 1942) / Temple Prasadam Counter',
    distanceM: 180,
    isVeg: true,
    priceRange: '₹60–₹140',
    mustTryReason: 'Legendary melt-in-the-mouth steamed idlis topped with a dollop of pure white butter, podi, and fragrant ghee.',
  },
  prakasam_barrage: {
    dishName: 'Vijayawada Ulavacharu Biryani & Punugulu',
    iconicSpot: 'Sweet Magic / Riverfront Street Kiosks',
    distanceM: 80,
    isVeg: true,
    priceRange: '₹40–₹180',
    mustTryReason: 'Crispy deep-fried golden urad dal fritters with ginger chutney, followed by tangy horse gram brown rice delicacy.',
  },
};

/**
 * Get hyper-local signature dish recommendation for a place.
 * @param {object} place Place object
 * @param {string} cityName City name
 */
function getSignatureDish(place = {}, cityName = '') {
  const name = String(place.name || '').toLowerCase();
  const id = String(place.id || '').toLowerCase();
  const cat = String(place.cat || '').toLowerCase();

  for (const [key, data] of Object.entries(SIGNATURE_DISH_REGISTRY)) {
    const cleanKey = key.replace(/_/g, ' ');
    if (name.includes(cleanKey) || id.includes(key)) {
      return {
        ...data,
        matchedBy: 'poi_exact',
      };
    }
  }

  // City or category fallback heuristics
  const cName = String(cityName || place.city || place.cityKey || place.region || '').toLowerCase();
  if (cat === 'temple') {
    return {
      dishName: 'Holy Temple Prasadam & Sweets',
      iconicSpot: 'Official Temple Trust Counter near entrance',
      distanceM: 30,
      isVeg: true,
      priceRange: '₹20–₹50',
      mustTryReason: 'Freshly prepared traditional sweet laddu or pulihora prasadam.',
      matchedBy: 'category_fallback',
    };
  }

  if (cat === 'beach') {
    return {
      dishName: 'Fresh Sea-Breeze Snacks & Tender Coconut',
      iconicSpot: 'Beach Promenade Kiosks',
      distanceM: 25,
      isVeg: true,
      priceRange: '₹40–₹80',
      mustTryReason: 'Roasted corn with lime-chilli butter and sweet tender coconut water.',
      matchedBy: 'category_fallback',
    };
  }

  if (cName.includes('paderu') || cName.includes('araku') || cName.includes('lambasingi') || cName.includes('vanjangi')) {
    return {
      dishName: 'Araku Bongu Chicken (Bamboo Chicken) & Fresh Organic Coffee',
      iconicSpot: 'Highland Tribal Food Vendors / Araku Valley Stalls',
      distanceM: 50,
      isVeg: false,
      priceRange: '₹120–₹250',
      mustTryReason: 'Traditional tribal delicacy cooked inside hollow bamboo stems without oil over woodfire coals.',
      matchedBy: 'city_fallback',
    };
  }

  if (cName.includes('chennai') || cName.includes('madras')) {
    return {
      dishName: 'Filter Coffee & Medu Vada',
      iconicSpot: 'Murugan Idli Shop / Rayar’s Mess Mylapore',
      distanceM: 80,
      isVeg: true,
      priceRange: '₹40–₹90',
      mustTryReason: 'Frothy aromatic chicory-blended filter coffee with crispy golden lentil vadas.',
      matchedBy: 'city_fallback',
    };
  }

  if (cName.includes('hyderabad')) {
    return {
      dishName: 'Irani Chai & Osmania Biscuits',
      iconicSpot: 'Nearby Local Irani Cafe',
      distanceM: 150,
      isVeg: true,
      priceRange: '₹30–₹60',
      mustTryReason: 'Classic Hyderabadi tea-time tradition with buttery biscuits.',
      matchedBy: 'city_fallback',
    };
  }

  if (cName.includes('vizag') || cName.includes('visakhapatnam')) {
    return {
      dishName: 'Andhra Mirchi Bajji & Punugulu',
      iconicSpot: 'Local Street Carts',
      distanceM: 100,
      isVeg: true,
      priceRange: '₹30–₹60',
      mustTryReason: 'Crispy deep-fried street snacks served with spicy peanut and ginger chutneys.',
      matchedBy: 'city_fallback',
    };
  }

  if (cName.includes('tirupati') || cName.includes('tirumala')) {
    return {
      dishName: 'Tirupati Laddu Prasadam & Bhimas Andhra Thali',
      iconicSpot: 'Bhimas Deluxe Heritage / Railway Station Road',
      distanceM: 60,
      isVeg: true,
      priceRange: '₹50–₹200',
      mustTryReason: 'Pure ghee Tirupati laddu prasadam and authentic spicy Rayalaseema vegetarian thali.',
      matchedBy: 'city_fallback',
    };
  }

  if (cName.includes('vijayawada') || cName.includes('bezawada')) {
    return {
      dishName: 'Babai Hotel Ghee Idli & Ulavacharu Biryani',
      iconicSpot: 'Babai Hotel / Sweet Magic MG Road',
      distanceM: 50,
      isVeg: true,
      priceRange: '₹50–₹220',
      mustTryReason: 'Iconic steamed butter idlis and flavorful Krishna district horsegram biryani.',
      matchedBy: 'city_fallback',
    };
  }

  return null;
}

module.exports = {
  getSignatureDish,
  SIGNATURE_DISH_REGISTRY,
};
