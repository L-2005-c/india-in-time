// services/travelIntelligence/culturalRitualEngine.js
// Synchronizes Indian heritage places with spiritual rituals, Aarti timings,
// temple sanctum closures (afternoon Naivedyam), light & sound shows, and weekend palace illuminations.
'use strict';

const { t2m } = require('./timeEngine');

const CULTURAL_RITUAL_DATA = {
  // Visakhapatnam & AP
  simhachalam: {
    name: 'Simhachalam Temple',
    rituals: [
      { name: 'Suprabhata Seva', start: '05:00', end: '06:00', type: 'morning_ritual', note: 'Serene early morning holy chanting' },
      { name: 'Sarvadarshanam', start: '07:00', end: '11:30', type: 'darshan', note: 'General Darshan window' },
      { name: 'Sanctum Afternoon Closure (Naivedyam)', start: '12:00', end: '15:30', type: 'closure', note: 'Inner sanctum closed for afternoon Naivedyam offerings' },
      { name: 'Evening Sandhya Aarti & Darshan', start: '18:00', end: '19:30', type: 'aarti', note: 'Mesmerizing evening deeparadhana' },
    ],
    prasad: 'Famous Simhachalam Appalu (sweet jaggery delicacy)',
    dressCode: 'Traditional Indian attire (Dhoti/Kurta for men, Saree/Chudidar for women)',
  },
  kanaka_mahalakshmi: {
    name: 'Sri Kanaka Mahalakshmi Temple',
    rituals: [
      { name: 'Abhishekam & Morning Puja', start: '05:00', end: '07:30', type: 'aarti', note: 'Devotees can perform personal puja' },
      { name: 'Ksheerabhishekam', start: '11:00', end: '12:00', type: 'morning_ritual', note: 'Sacred milk bath ceremony' },
      { name: 'Evening Deeparadhana', start: '18:30', end: '19:30', type: 'aarti', note: 'Grand lamp lighting' },
    ],
  },
  // Hyderabad & Telangana
  birla_mandir: {
    name: 'Birla Mandir',
    rituals: [
      { name: 'Morning Mangal Aarti', start: '07:00', end: '07:30', type: 'aarti', note: 'Peaceful hilltop chants overlooking the city' },
      { name: 'Afternoon Break', start: '12:00', end: '15:00', type: 'closure', note: 'Temple closed in afternoon' },
      { name: 'Evening Sandhya Aarti & Night View', start: '18:30', end: '19:45', type: 'aarti', note: 'Golden illuminated marble vista with Hussain Sagar views' },
    ],
  },
  golconda_fort: {
    name: 'Golconda Fort',
    rituals: [
      { name: 'Light & Sound Show (English/Hindi)', start: '18:30', end: '20:00', type: 'light_show', note: 'Spectacular historic narrative narrated by Amitabh Bachchan' },
    ],
  },
  charminar: {
    name: 'Charminar',
    rituals: [
      { name: 'Night Architectural Illumination', start: '19:00', end: '22:30', type: 'illumination', note: 'Warm golden floodlighting of the 400-year-old minarets' },
    ],
  },
  // Varanasi
  varanasi_ghats: {
    name: 'Dashashwamedh Ghat / Assi Ghat',
    aliases: ['dashashwamedh', 'assi ghat', 'varanasi ghat', 'ghat', 'ganga aarti', 'manikarnika'],
    rituals: [
      { name: 'Subah-e-Banaras (Morning Aarti & Yoga)', start: '05:30', end: '06:45', type: 'morning_ritual', note: 'Sunrise classical music and morning Vedic aarti at Assi Ghat' },
      { name: 'Grand Maha Ganga Aarti', start: '18:30', end: '19:45', type: 'aarti', note: 'Unmissable multi-tiered brass lamp ritual at Dashashwamedh Ghat' },
    ],
  },
  kashi_vishwanath: {
    name: 'Kashi Vishwanath Temple',
    aliases: ['kashi', 'vishwanath'],
    rituals: [
      { name: 'Mangala Aarti', start: '03:00', end: '04:00', type: 'aarti', note: 'Pre-dawn most auspicious ceremony' },
      { name: 'Bhog Aarti & Afternoon Break', start: '11:30', end: '13:30', type: 'morning_ritual', note: 'Bhog offering followed by short sanctum reset' },
      { name: 'Sandhya Aarti', start: '19:00', end: '20:15', type: 'aarti', note: 'Evening musical aarti' },
      { name: 'Shayan Aarti', start: '22:30', end: '23:00', type: 'night_ritual', note: 'Bedtime divine lullaby' },
    ],
  },
  // Jaipur
  amber_fort: {
    name: 'Amber Fort',
    aliases: ['amber', 'amer fort'],
    rituals: [
      { name: 'Elephant / Jeep Ascents & Morning Light', start: '08:00', end: '10:30', type: 'morning_ritual', note: 'Best morning sun hitting the yellow sandstone' },
      { name: 'Light & Sound Show (Amber Son-et-Lumiere)', start: '19:00', end: '20:30', type: 'light_show', note: 'History of the Kachwaha Rajput rulers projected on Maota Lake' },
    ],
  },
  hawa_mahal: {
    name: 'Hawa Mahal',
    aliases: ['hawa mahal'],
    rituals: [
      { name: 'Morning Golden Sunlight on Facade', start: '06:30', end: '08:30', type: 'morning_ritual', note: 'Sunrise illuminates the 953 jharokha windows directly from the front' },
      { name: 'Evening Night Glow', start: '19:00', end: '22:00', type: 'illumination', note: 'Illuminated facade viewed from opposite heritage rooftops' },
    ],
  },
  // Amritsar
  golden_temple: {
    name: 'Sri Harmandir Sahib (Golden Temple)',
    aliases: ['harmandir', 'golden temple', 'darbar sahib'],
    rituals: [
      { name: 'Amrit Vela & Prakash Ceremony', start: '04:30', end: '06:00', type: 'morning_ritual', note: 'Guru Granth Sahib carried into the sanctum amidst golden dawn' },
      { name: 'Gurbani Kirtan (Continuous)', start: '06:00', end: '21:00', type: 'spiritual', note: 'Live soulful hymn singing echoing across the sacred Sarovar' },
      { name: 'Sukhasan & Palki Sahib Ceremony', start: '21:30', end: '22:45', type: 'night_ritual', note: 'Holy scripture taken to the Akal Takht in a golden palanquin' },
    ],
  },
  // Mysore
  mysore_palace: {
    name: 'Mysore Palace (Amba Vilas)',
    aliases: ['mysore palace', 'amba vilas'],
    rituals: [
      { name: 'Grand 100,000-Bulb Illumination (Sunday & Holidays)', start: '19:00', end: '19:45', type: 'illumination', note: 'Breathtaking full palace glow with 97,000+ golden incandescent bulbs', daysOfWeek: [0] },
      { name: 'Sound & Light Show', start: '19:00', end: '20:00', type: 'light_show', note: '45-minute history of the Wadiyar dynasty', daysOfWeek: [1, 2, 3, 4, 5, 6] },
    ],
  },
  // Delhi
  akshardham: {
    name: 'Swaminarayan Akshardham',
    aliases: ['akshardham'],
    rituals: [
      { name: 'Sahaj Anand Musical Water Show', start: '19:15', end: '20:00', type: 'light_show', note: 'Mesmerizing 24-minute multi-media water fountain show at Yagnapurush Kund' },
    ],
  },
  red_fort: {
    name: 'Red Fort (Lal Qila)',
    aliases: ['red fort', 'lal qila'],
    rituals: [
      { name: 'Jai Hind Sound & Light Show', start: '19:30', end: '20:30', type: 'light_show', note: 'Immersive projection mapping across the ramparts' },
    ],
  },
  // Mumbai
  marine_drive: {
    name: 'Marine Drive & Queen\'s Necklace',
    aliases: ['marine drive', 'queens necklace'],
    rituals: [
      { name: 'Queen\'s Necklace Night Illumination', start: '18:45', end: '23:30', type: 'illumination', note: 'Iconic golden arc curve of streetlights along the Arabian Sea' },
    ],
  },
  siddhivinayak: {
    name: 'Siddhivinayak Temple Prabhadevi',
    aliases: ['siddhivinayak', 'siddhi vinayak'],
    rituals: [
      { name: 'Kakad Aarti', start: '05:30', end: '06:00', type: 'aarti', note: 'Early morning waking aarti for Lord Ganesha' },
      { name: 'Sanctum Midday Naivedya Rest', start: '12:15', end: '13:15', type: 'closure', note: 'Brief sanctum closure for afternoon Maha Naivedya' },
      { name: 'Sandhya Aarti', start: '19:00', end: '19:30', type: 'aarti', note: 'Evening deeparadhana' },
      { name: 'Shejarati', start: '21:50', end: '22:15', type: 'night_ritual', note: 'Night sleep aarti before sanctum closes' },
    ],
    prasad: 'Modak and coconut laddoos',
    dressCode: 'Modest dress code',
  },
  // Paderu & Alluri Agency
  modakondamma: {
    name: 'Sri Modakondamma Temple Paderu',
    aliases: ['modakondamma', 'paderu temple'],
    rituals: [
      { name: 'Giri Pradakshina & Morning Puja', start: '06:00', end: '08:00', type: 'morning_ritual', note: 'Auspicious tribal hill mother goddess blessing' },
      { name: 'Sanctum Afternoon Closure (Bhog)', start: '12:30', end: '15:30', type: 'closure', note: 'Sanctum closed for afternoon sacred offering' },
      { name: 'Evening Deeparadhana & Mangala Harathi', start: '18:00', end: '19:30', type: 'aarti', note: 'Evening bell resonances across the Agency valley' },
    ],
    prasad: 'Modakondamma Bellam Appalu & Sweet Pongal',
    dressCode: 'Modest traditional attire recommended',
  },
  // Chennai
  kapaleeshwarar: {
    name: 'Kapaleeshwarar Temple Mylapore',
    aliases: ['kapaleeshwarar', 'mylapore temple', 'kapali'],
    rituals: [
      { name: 'Ko Puja & Ushakkala Puja', start: '06:00', end: '07:30', type: 'morning_ritual', note: 'Traditional Vedic chanting and sacred cow worship at sunrise' },
      { name: 'Sanctum Afternoon Closure (Uchikala Naivedyam)', start: '12:30', end: '16:00', type: 'closure', note: 'Inner sanctum closed for midday rest & sacred rituals' },
      { name: 'Sayaratchai & Sandhya Aarti', start: '17:30', end: '19:00', type: 'aarti', note: 'Dravidian nadaswaram music and camphor lamp offering' },
      { name: 'Arthajama Puja', start: '21:00', end: '21:30', type: 'night_ritual', note: 'Final nighttime closing ceremony' },
    ],
    prasad: 'Mylapore temple puliyodarai (tamarind rice) & sakkarai pongal',
    dressCode: 'Strict traditional attire (Dhoti/Shirt for men, Saree/Salwar for women)',
  },
  // Tirupati & Tirumala
  tirumala: {
    name: 'Tirumala Venkateswara Temple',
    aliases: ['tirumala', 'venkateswara', 'balaji', 'srivari'],
    rituals: [
      { name: 'Suprabhata Seva', start: '03:00', end: '04:00', type: 'morning_ritual', note: 'Awakening of the Lord with Venkateswara Suprabhatam chanting' },
      { name: 'Morning Sarvadarshanam', start: '07:00', end: '11:45', type: 'darshan', note: 'General queue darshan window' },
      { name: 'Sanctum Madhyahna Naivedyam', start: '12:00', end: '13:30', type: 'closure', note: 'Sanctum darshan halted for Rajabhoga Naivedyam offering' },
      { name: 'Sahasra Deepalankarana Seva', start: '17:30', end: '18:30', type: 'aarti', note: 'Lord Malayappa Swami amidst 1000 brass lamps in Unjal Mandapam' },
      { name: 'Ekanta Seva & Curfew Closure', start: '23:45', end: '03:00', type: 'curfew', note: 'Tirumala Ghat road and sanctum night curfew: Uphill road closed 23:45-03:00' },
    ],
    prasad: 'Authentic TTD Srivari Laddu Prasadam & Pulihora',
    dressCode: 'Strict TTD traditional dress code (Dhoti/Uttariyam or Kurta-Pyjama for men; Saree or Chudidar for women)',
  },
  // Vijayawada
  kanaka_durga: {
    name: 'Sri Durga Malleswara Swamy Varla Devasthanam (Kanaka Durga)',
    aliases: ['kanaka durga', 'indrakeeladri', 'durga temple vijayawada'],
    rituals: [
      { name: 'Suprabhata Seva & Snapanabhishekam', start: '04:00', end: '06:00', type: 'morning_ritual', note: 'Dawn holy bath ceremony atop Indrakeeladri hill overlooking the Krishna river' },
      { name: 'Khadgamala Archana & Darshan', start: '07:00', end: '11:30', type: 'darshan', note: 'Devi sacred flower garland worship' },
      { name: 'Sanctum Afternoon Closure (Maha Naivedyam)', start: '12:30', end: '14:30', type: 'closure', note: 'Sanctum closed for afternoon sacred bhog' },
      { name: 'Nitya Chandi Homam & Evening Aarti', start: '17:30', end: '19:30', type: 'aarti', note: 'Evening deeparadhana and temple chariot pradakshina' },
      { name: 'Shayana Seva', start: '21:30', end: '22:00', type: 'night_ritual', note: 'Closing ritual for the Goddess' },
    ],
    prasad: 'Goddess Laddu Prasadam, Daddojanam, and Kadambam',
    dressCode: 'Traditional Indian attire',
  },
};

function matchCulturalEntry(place = {}) {
  const name = String(place.name || '').toLowerCase();
  const id = String(place.id || '').toLowerCase();

  for (const [key, data] of Object.entries(CULTURAL_RITUAL_DATA)) {
    const dName = data.name.toLowerCase();
    const cleanKey = key.replace(/_/g, ' ');
    const aliases = Array.isArray(data.aliases) ? data.aliases : [];
    if (
      name.includes(cleanKey) ||
      name.includes(dName) ||
      id.includes(key) ||
      aliases.some((a) => name.includes(a.toLowerCase()))
    ) {
      return data;
    }
  }

  // Generic category heuristic
  const cat = String(place.cat || '').toLowerCase();
  if (cat === 'temple') {
    return {
      name: place.name,
      rituals: [
        { name: 'Morning Darshan & Puja', start: '06:00', end: '08:30', type: 'morning_ritual', note: 'Peaceful morning prayer window' },
        { name: 'Sanctum Afternoon Naivedyam Rest', start: '12:30', end: '16:00', type: 'closure', note: 'Temple sanctum may have limited access during afternoon rituals' },
        { name: 'Evening Deeparadhana / Aarti', start: '18:00', end: '19:30', type: 'aarti', note: 'Evening lamp lighting and chants' },
      ],
      prasad: 'Temple Prasadam available at temple counter',
      dressCode: 'Modest/Traditional attire recommended (shoulders & knees covered)',
    };
  }

  if (cat === 'fort') {
    return {
      name: place.name,
      rituals: [
        { name: 'Sunset Golden Hour Glow', start: '17:00', end: '18:15', type: 'illumination', note: 'Ramparts bathed in warm evening light' },
      ],
    };
  }

  return null;
}

/**
 * Compute cultural ritual intelligence for a place at a given arrival time.
 * @param {object} place Place object
 * @param {number|Date} arriveMin Arrival minute from midnight (0..1439) or Date object
 * @param {number} dow Day of week (0=Sunday .. 6=Saturday)
 */
function getCulturalRitualIntel(place, arriveMin = 600, dow = new Date().getDay()) {
  const entry = matchCulturalEntry(place);
  if (!entry || !Array.isArray(entry.rituals)) {
    return null;
  }

  let min = arriveMin;
  let dayOfWeek = dow;
  if (arriveMin instanceof Date) {
    min = arriveMin.getHours() * 60 + arriveMin.getMinutes();
    dayOfWeek = arriveMin.getDay();
  }

  const activeRituals = [];
  const upcomingRituals = [];
  let isSanctumClosed = false;
  let sanctumClosureReason = null;
  let activeAarti = null;
  let activeShow = null;
  let culturalBadge = null;

  for (const ritual of entry.rituals) {
    if (Array.isArray(ritual.daysOfWeek) && !ritual.daysOfWeek.includes(dayOfWeek)) {
      continue;
    }

    const startM = t2m(ritual.start);
    const endM = t2m(ritual.end);

    const isActive = startM <= endM
      ? (min >= startM && min <= endM)
      : (min >= startM || min <= endM);

    if (isActive) {
      activeRituals.push(ritual);
      if (ritual.type === 'closure' || ritual.type === 'curfew') {
        isSanctumClosed = true;
        sanctumClosureReason = ritual.note;
      }
      if (ritual.type === 'curfew') {
        culturalBadge = `⛔ ${ritual.name}`;
      }
      if (ritual.type === 'aarti') {
        activeAarti = ritual;
        culturalBadge = `🪔 ${ritual.name}`;
      }
      if (ritual.type === 'morning_ritual' && !culturalBadge) {
        culturalBadge = `🌅 ${ritual.name}`;
      }
      if (ritual.type === 'light_show' || ritual.type === 'illumination') {
        activeShow = ritual;
        culturalBadge = `✨ ${ritual.name}`;
      }
    } else if (startM > min && startM - min <= 90) {
      upcomingRituals.push({
        ...ritual,
        startsInMin: startM - min,
      });
      if (!culturalBadge && (ritual.type === 'aarti' || ritual.type === 'light_show')) {
        culturalBadge = `⏳ ${ritual.name} in ${startM - min}m`;
      }
    }
  }

  const primaryUpcoming = upcomingRituals[0] || null;

  return {
    placeName: entry.name,
    activeRituals,
    activeRitual: activeRituals[0] || null,
    upcomingRituals,
    isSanctumClosed,
    isSanctumClosure: isSanctumClosed,
    sanctumClosureReason,
    sanctumClosureWindow: '12:30–15:30',
    activeAarti,
    activeShow,
    culturalBadge,
    prasad: entry.prasad || null,
    dressCode: entry.dressCode || null,
    recommendation: isSanctumClosed
      ? `⚠️ Inner sanctum is resting (${sanctumClosureReason || '12:30–16:00'}). Enjoy outer courtyards or reschedule for evening Aarti.`
      : activeAarti
        ? `🪔 Auspicious timing: Arrived during ${activeAarti.name}! Experience the divine evening chanting.`
        : activeShow
          ? `✨ Perfect timing: Arrived in time for ${activeShow.name}!`
          : primaryUpcoming
            ? `ℹ️ Note: ${primaryUpcoming.name} begins at ${primaryUpcoming.start} (in ${primaryUpcoming.startsInMin} mins).`
            : null,
  };
}

module.exports = {
  getCulturalRitualIntel,
  CULTURAL_RITUAL_DATA,
  matchCulturalEntry,
};
