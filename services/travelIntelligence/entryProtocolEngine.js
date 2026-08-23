// services/travelIntelligence/entryProtocolEngine.js
// Smart Entry Checklist & Indian Travel Armor rules for smooth, surprise-free tourist entry.
'use strict';

const ENTRY_PROTOCOL_DATA = {
  simhachalam: {
    footwear: { requiredOff: true, tokenStand: 'Free Devasthanam Shoe Counter (Gate 1 & 2)', socksTip: 'White marble gets hot by 11:30 AM — carry cotton socks' },
    dressCode: { strict: true, description: 'Traditional attire mandatory (Dhoti/Kurta for men, Saree/Chudidar with dupatta for women). No western shorts/skirts.' },
    security: { mobileAllowed: true, photographyAllowed: false, innerSanctumCamerasBanned: true, cloakroom: 'Available at uphill main counter' },
    tickets: { onSpot: true, onlineQr: 'Available on TTD / Devasthanam portal', quickDarshanTicket: '₹100 / ₹300 Special Entry counter available' },
  },
  kanaka_mahalakshmi: {
    footwear: { requiredOff: true, tokenStand: 'Free shoe stand near queue entry', socksTip: 'Stone path can be warm at midday' },
    dressCode: { strict: false, description: 'Modest respectful clothing (cover shoulders & knees)' },
    security: { mobileAllowed: true, photographyAllowed: false },
    tickets: { onSpot: true, freeEntry: true },
  },
  birla_mandir: {
    footwear: { requiredOff: true, tokenStand: 'Free shoe stand at base steps', socksTip: 'Pure white marble gets warm under summer sun' },
    dressCode: { strict: true, description: 'Decent attire (no short shorts or sleeveless tops)' },
    security: { mobileAllowed: false, cloakroomRequired: true, cloakroomNote: 'Phones, cameras, bags, and electronic items must be deposited in security lockers before entry' },
    tickets: { onSpot: true, freeEntry: true },
  },
  akshardham: {
    footwear: { requiredOff: true, tokenStand: 'Numbered shoe cloakroom before security' },
    dressCode: { strict: true, description: 'Upper body and lower body must be covered below knees (free sarongs provided at security deposit if needed)' },
    security: { mobileAllowed: false, cloakroomRequired: true, cloakroomNote: 'Strictly zero electronics (phones, powerbanks, smartwatches, cameras) allowed inside' },
    tickets: { onSpot: true, freeEntry: true, waterShowTicket: '₹90 / ₹100 evening show ticket' },
  },
  golden_temple: {
    footwear: { requiredOff: true, tokenStand: 'Grand free Jora Ghar (Shoe Keeping Hall with tokens)', washFeetPool: 'Walk through cleansing water channel before stepping onto marble' },
    dressCode: { strict: true, headCoverMandatory: true, description: 'Head must remain covered at all times (scarves/rumals provided free outside), remove shoes and socks' },
    security: { mobileAllowed: true, photographyAllowed: true, perimeterOnly: 'Photography allowed on Parikrama path, strictly prohibited inside inner sanctum' },
    tickets: { freeEntry: true },
  },
  kashi_vishwanath: {
    footwear: { requiredOff: true, tokenStand: 'Locker counters inside Ganga corridor gates' },
    dressCode: { strict: true, description: 'Traditional attire for inner sanctum touch/abhishekam' },
    security: { mobileAllowed: false, cloakroomRequired: true, cloakroomNote: 'Phones and electronics must be kept in corridor digital lockers' },
    tickets: { onSpot: true, onlineQr: 'Sugam Darshan VIP passes available online on Shri Kashi Vishwanath portal' },
  },
  golconda_fort: {
    footwear: { requiredOff: false, terrainTip: 'Steep cobblestone incline (360+ steps to Balahisar) — wear sturdy grip shoes' },
    dressCode: { strict: false, description: 'Comfortable breathable clothing & sun hat recommended' },
    security: { mobileAllowed: true, cameraFee: '₹25 for video camera, mobile photography free, drones strictly prohibited' },
    tickets: { onSpot: false, onlineQr: 'ASI Online Ticket QR booking mandatory at entry gate (₹25 Indian / ₹300 Foreigner)' },
  },
  charminar: {
    footwear: { requiredOff: false, spiralStairsTip: 'Narrow spiral stone staircase — watch your footing' },
    dressCode: { strict: false, description: 'Casual tourist wear' },
    security: { mobileAllowed: true, cameraFee: 'Mobile allowed, tripods prohibited on upper minaret balcony' },
    tickets: { onSpot: true, onlineQr: 'ASI QR code ticket counter outside monument' },
  },
  amber_fort: {
    footwear: { requiredOff: false, templeInsideOff: 'Shoes must be removed only when visiting the inner Shila Devi Temple' },
    dressCode: { strict: false, description: 'Sun protection, sunglasses & walking shoes advised' },
    security: { mobileAllowed: true, cameraFee: 'Commercial cameras require permit' },
    tickets: { onSpot: true, compositeTicket: 'Jaipur Composite Entry Pass valid for Amber, Hawa Mahal, Jantar Mantar & Albert Hall' },
  },
  red_fort: {
    footwear: { requiredOff: false, walkingTip: 'Extensive complex spanning 250+ acres — comfortable walking footwear essential' },
    dressCode: { strict: false, description: 'Casual modesty' },
    security: { mobileAllowed: true, securityCheck: 'Rigorous CISF metal-detector screening — avoid carrying sharp items or heavy luggage' },
    tickets: { onSpot: false, onlineQr: 'ASI online digital booking QR recommended to skip lengthy entry lines' },
  },
  ins_kursura_submarine: {
    footwear: { requiredOff: false, submarineTip: 'Narrow hatchways and metallic ladders inside submarine — avoid high heels' },
    dressCode: { strict: false, description: 'Comfortable clothing for tight naval corridors' },
    security: { mobileAllowed: true, cameraFee: '₹50 digital camera ticket' },
    tickets: { onSpot: true, spotPrice: '₹70 Adult / ₹40 Child' },
  },
};

/**
 * Get structured entry protocol and travel readiness for a place.
 * @param {object} place Place object
 */
function getEntryProtocol(place = {}) {
  const name = String(place.name || '').toLowerCase();
  const id = String(place.id || '').toLowerCase();
  const cat = String(place.cat || '').toLowerCase();

  for (const [key, data] of Object.entries(ENTRY_PROTOCOL_DATA)) {
    const cleanKey = key.replace(/_/g, ' ');
    if (name.includes(cleanKey) || id.includes(key)) {
      return {
        ...data,
        matchedBy: 'poi_exact',
      };
    }
  }

  // Category fallback heuristics
  if (cat === 'temple') {
    return {
      footwear: { requiredOff: true, tokenStand: 'Free/token shoe stand near gate', socksTip: 'Carry cotton socks during sunny afternoon hours' },
      dressCode: { strict: true, description: 'Modest respectful attire covering shoulders and knees' },
      security: { mobileAllowed: true, photographyAllowed: false, sanctumNote: 'Photography restricted inside the sanctum' },
      tickets: { onSpot: true, freeEntry: true },
      matchedBy: 'category_fallback',
    };
  }

  if (cat === 'fort' || cat === 'monument') {
    return {
      footwear: { requiredOff: false, terrainTip: 'Uneven stone steps and walkways — wear sturdy walking shoes' },
      dressCode: { strict: false, description: 'Comfortable sun-protective clothing' },
      security: { mobileAllowed: true, cameraFee: 'Standard ASI rules apply' },
      tickets: { onSpot: true, onlineQr: 'ASI QR code booking available at gate' },
      matchedBy: 'category_fallback',
    };
  }

  if (cat === 'beach') {
    return {
      footwear: { requiredOff: false, beachTip: 'Sandals or slip-on footwear recommended' },
      dressCode: { strict: false, description: 'Casual beachwear (swimwear culturally acceptable at designated tourist coves)' },
      security: { mobileAllowed: true, lifeguardWarning: 'Follow beach lifeguard flag warnings and avoid swimming past dusk' },
      tickets: { freeEntry: true },
      matchedBy: 'category_fallback',
    };
  }

  return {
    footwear: { requiredOff: false },
    dressCode: { strict: false, description: 'Standard attire' },
    security: { mobileAllowed: true },
    tickets: { onSpot: true },
    matchedBy: 'default',
  };
}

module.exports = {
  getEntryProtocol,
  ENTRY_PROTOCOL_DATA,
};
