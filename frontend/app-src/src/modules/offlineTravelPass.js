// frontend/app-src/src/modules/offlineTravelPass.js
// Generates rich WhatsApp travel share cards and interactive offline printable travel passes.

export const EMERGENCY_DIRECTORIES = {
  national: [
    { title: 'National Emergency', num: '112', icon: '🚨' },
    { title: 'Police Assistance', num: '100', icon: '👮' },
    { title: 'Ambulance / Medical', num: '108', icon: '🚑' },
    { title: 'Women Safety Helpline', num: '1091', icon: '🛡️' },
    { title: 'Tourist Helpline (Multi-lingual)', num: '1363', icon: '🧭' },
    { title: 'Railway Helpline', num: '139', icon: '🚆' },
  ],
  alluri_paderu: [
    { title: 'ITDA Control Room (Tribal Dev)', num: '08935-250022', icon: '🏛️' },
    { title: 'Paderu Area Hospital Emergency', num: '08935-250100', icon: '🏥' },
    { title: 'AP Forest Dept / Ghat Emergency', num: '1800-425-4700', icon: '🌲' },
    { title: 'Araku Valley Police Station', num: '08936-249633', icon: '👮' },
  ],
  tirupati: [
    { title: 'TTD Vigilance & Security (Tirumala)', num: '1800-425-4141', icon: '🛕' },
    { title: 'Tirupati Pilgrim Helpdesk', num: '0877-2277777', icon: '📞' },
    { title: 'Alipiri Toll & Ghat Emergency', num: '0877-2264222', icon: '🚗' },
    { title: 'SVIMS Super Specialty Emergency', num: '0877-2877777', icon: '🏥' },
  ],
  visakhapatnam: [
    { title: 'Vizag Marine Police / Beach Patrol', num: '0891-2565454', icon: '🌊' },
    { title: 'King George Hospital (KGH) Casualty', num: '0891-2564891', icon: '🏥' },
    { title: 'Vizag City Traffic Control', num: '0891-2525555', icon: '🚦' },
    { title: 'Vizag Port Disaster Cell', num: '0891-2874000', icon: '⚓' },
  ],
  delhi_ncr: [
    { title: 'Delhi Police Control Room', num: '112 / 100', icon: '👮' },
    { title: 'AIIMS Emergency Casualty', num: '011-26588500', icon: '🏥' },
    { title: 'Delhi Traffic Helpline', num: '011-25844444', icon: '🚦' },
    { title: 'Delhi Tourism Helpline', num: '011-23365320', icon: '🧭' },
  ],
  mumbai: [
    { title: 'Mumbai Police Control', num: '100 / 022-22620111', icon: '👮' },
    { title: 'KEM Hospital Casualty', num: '022-24107000', icon: '🏥' },
    { title: 'Mumbai Traffic Control', num: '022-24937747', icon: '🚦' },
    { title: 'Coast Guard Western Region', num: '022-24371932', icon: '🌊' },
  ],
  bengaluru: [
    { title: 'Bengaluru City Police', num: '112', icon: '👮' },
    { title: 'Victoria Hospital Emergency', num: '080-26701150', icon: '🏥' },
    { title: 'Bengaluru Traffic Control (103)', num: '080-22868550', icon: '🚦' },
    { title: 'Karnataka Tourist Assistance', num: '080-22352828', icon: '🧭' },
  ],
  jaipur: [
    { title: 'Jaipur Police Control', num: '112 / 0141-2605555', icon: '👮' },
    { title: 'SMS Hospital Emergency', num: '0141-2560291', icon: '🏥' },
    { title: 'Rajasthan Tourist Assistance Force', num: '0141-2822863', icon: '🏰' },
  ],
  chennai: [
    { title: 'Chennai Police Control Room', num: '100 / 044-23452359', icon: '👮' },
    { title: 'Rajiv Gandhi Govt General Hospital', num: '044-25305000', icon: '🏥' },
    { title: 'Chennai Coastal Security Group', num: '044-28447701', icon: '🌊' },
    { title: 'Chennai Traffic Control (103)', num: '044-23452362', icon: '🚦' },
  ],
  kerala: [
    { title: 'Kerala Police Help Desk', num: '112', icon: '👮' },
    { title: 'High Range / Ghat Rescue Cell', num: '04865-230233', icon: '⛰️' },
    { title: 'Highway Police Patrol', num: '9846100100', icon: '🚗' },
    { title: 'District Disaster Cell', num: '1077', icon: '🚨' },
  ],
  kolkata: [
    { title: 'Kolkata Police Control Room', num: '100 / 033-22143230', icon: '👮' },
    { title: 'SSKM Hospital Casualty', num: '033-22231589', icon: '🏥' },
    { title: 'Kolkata Traffic Helpline', num: '033-22143644', icon: '🚦' },
  ],
  goa: [
    { title: 'Goa Police Helpline', num: '112', icon: '👮' },
    { title: 'Goa Tourist Police', num: '0832-2425088', icon: '🏖️' },
    { title: 'Goa Medical College Emergency', num: '0832-2458725', icon: '🏥' },
    { title: 'Drishti Marine Coastal Rescue', num: '0832-2425000', icon: '🌊' },
  ],
};

export function resolveRegionKey(cityName = '', cityId = '') {
  const norm = (String(cityName) + ' ' + String(cityId)).toLowerCase();
  if (norm.includes('paderu') || norm.includes('araku') || norm.includes('lambasingi') || norm.includes('alluri') || norm.includes('borra')) {
    return 'alluri_paderu';
  }
  if (norm.includes('tirupati') || norm.includes('tirumala') || norm.includes('alipiri')) {
    return 'tirupati';
  }
  if (norm.includes('visakhapatnam') || norm.includes('vizag')) {
    return 'visakhapatnam';
  }
  if (norm.includes('delhi') || norm.includes('noida') || norm.includes('gurgaon') || norm.includes('ncr')) {
    return 'delhi_ncr';
  }
  if (norm.includes('mumbai') || norm.includes('bombay') || norm.includes('pune')) {
    return 'mumbai';
  }
  if (norm.includes('bangalore') || norm.includes('bengaluru') || norm.includes('mysore') || norm.includes('mysuru')) {
    return 'bengaluru';
  }
  if (norm.includes('jaipur') || norm.includes('udaipur') || norm.includes('jodhpur')) {
    return 'jaipur';
  }
  if (norm.includes('chennai') || norm.includes('madras') || norm.includes('madurai')) {
    return 'chennai';
  }
  if (norm.includes('kochi') || norm.includes('cochin') || norm.includes('munnar') || norm.includes('kerala') || norm.includes('alleppey')) {
    return 'kerala';
  }
  if (norm.includes('kolkata') || norm.includes('calcutta') || norm.includes('howrah')) {
    return 'kolkata';
  }
  if (norm.includes('goa') || norm.includes('panaji')) {
    return 'goa';
  }
  return null;
}

const SURVIVAL_LINGO = {
  hindi: [
    { en: 'How much for this?', local: 'Yeh kitne ka hai? (यह कितने का है?)' },
    { en: 'Please turn on the meter', local: 'Meter chalu kijiye (मीटर चालू कीजिये)' },
    { en: 'Where is this place?', local: 'Yeh jagah kahan hai? (यह जगह कहाँ है?)' },
    { en: 'Less spicy please', local: 'Mirchi kam rakhiye (मिर्ची कम रखिये)' },
    { en: 'Help me please', local: 'Meri madad kijiye (मेरी मदद कीजिये)' },
  ],
  telugu: [
    { en: 'How much is this?', local: 'Idhi entha? (ఇది ఎంత?)' },
    { en: 'Where is this place?', local: 'Ee chotu ekkada? (ఈ చోటు ఎక్కడ?)' },
    { en: 'Less spicy please', local: 'Kaaram thakkuva cheyandi (కారం తక్కువ చేయండి)' },
    { en: 'Please take me to...', local: 'Nannu ... theesukellandi (నన్ను ... తీసుకెళ్లండి)' },
    { en: 'Thank you', local: 'Dhanyavaadhamulu (ధన్యవాదాలు)' },
  ],
  tamil: [
    { en: 'How much is this?', local: 'Idhu evvalavu? (இது எவ்வளவு?)' },
    { en: 'Where is this place?', local: 'Indha idam engu irukkiradhu? (இந்த இடம் எங்கு இருக்கிறது?)' },
    { en: 'Less spicy please', local: 'Kaaram kuraivaga irukkatum (காரம் குறைவாக இருக்கட்டும்)' },
    { en: 'Thank you', local: 'Nandri (நன்றி)' },
  ],
  kannada: [
    { en: 'How much is this?', local: 'Idhu eshtu? (ಇದು ಎಷ್ಟು?)' },
    { en: 'Where is this place?', local: 'Ee jaaga ellidhe? (ಈ ಜಾಗ ಎಲ್ಲಿದೆ?)' },
    { en: 'Less spicy please', local: 'Khaara kadime maadi (ಖಾರ ಕಡಿಮೆ ಮಾಡಿ)' },
    { en: 'Thank you', local: 'Dhanyavaadagalu (ಧನ್ಯವಾದಗಳು)' },
  ],
  malayalam: [
    { en: 'How much is this?', local: 'Idhinu ethraya? (ഇതിന് എത്രയാ?)' },
    { en: 'Where is this place?', local: 'Ee sthalam evideya? (ഈ സ്ഥലം എവിടെയാ?)' },
    { en: 'Less spicy please', local: 'Erivu kurakkumo? (എരിവ് കുറയ്ക്കുമോ?)' },
    { en: 'Thank you', local: 'Nanni (നന്ദി)' },
    { en: 'Help me please', local: 'Enne onnu sahayikkyumo? (എന്നെ ഒന്ന് സഹായിക്കുമോ?)' },
  ],
  marathi: [
    { en: 'How much for this?', local: 'He kityala ahe? (हे कितीला आहे?)' },
    { en: 'Where is this place?', local: 'Hi jaaga kuthe ahe? (ही जागा कुठे आहे?)' },
    { en: 'Less spicy please', local: 'Tikhut kami theva (तिखट कमी ठेवा)' },
    { en: 'Thank you', local: 'Dhanyavaad (धन्यवाद)' },
    { en: 'Help me please', local: 'Krupaya mala madat kara (कृपया मला मदत करा)' },
  ],
  bengali: [
    { en: 'How much is this?', local: 'Eta koto? (এটা কত?)' },
    { en: 'Where is this place?', local: 'Ei jaygata kothay? (এই জায়গাটা কোথায়?)' },
    { en: 'Less spicy please', local: 'Jhaal kom deben (ঝাল কম দেবেন)' },
    { en: 'Thank you', local: 'Dhonnobad (ধন্যবাদ)' },
    { en: 'Help me please', local: 'Doya kore amake sahajyo korun (দয়া করে আমাকে সাহায্য করুন)' },
  ],
};

/**
 * Generate a beautifully structured, emoji-rich WhatsApp itinerary text.
 */
export function generateWhatsAppShareText(mdPlan, currentCityName, dayIdx = 0, cityId = '') {
  if (!mdPlan || !mdPlan.length) return '';
  const day = mdPlan[dayIdx] || mdPlan[0] || [];
  const city = currentCityName || 'India';
  const regionKey = resolveRegionKey(city, cityId);
  const regionalEmer = regionKey ? EMERGENCY_DIRECTORIES[regionKey] : null;

  let text = `🇮🇳 *INDIA IN-TIME TRAVEL PASS*\n`;
  text += `📍 *Destination:* ${city} (Day ${dayIdx + 1} of ${mdPlan.length})\n`;
  text += `📅 *Schedule generated:* ${new Date().toLocaleDateString('en-IN')}\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🧭 *DAY ${dayIdx + 1} TIMELINE & SMART ROUTE*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  day.forEach((stop, i) => {
    if (stop.isBreak) {
      text += `☕ *${stop.sts || '--'}* — Break / Tea Reset (${stop.vt || 15}m)\n\n`;
      return;
    }
    const emoji = stop.cat === 'temple' ? '🛕' : stop.cat === 'beach' ? '🏖️' : stop.cat === 'food' ? '🍛' : '📍';
    text += `${i + 1}. ${emoji} *${stop.name}*\n`;
    text += `   🕒 *Time:* ${stop.sts || stop.arriveAt || '--'} → ${stop.ets || stop.leaveAt || '--'} (${stop.vt || 45}m visit)\n`;

    if (stop.cultural?.culturalBadge) {
      text += `   🪔 *Ritual:* ${stop.cultural.culturalBadge}\n`;
    }
    if (stop.signatureDish?.dishName) {
      text += `   🍛 *Must-Try:* ${stop.signatureDish.dishName} at ${stop.signatureDish.iconicSpot}\n`;
    }
    if (stop.entryProtocol?.footwear?.requiredOff) {
      text += `   👟 *Entry Tip:* Remove shoes (${stop.entryProtocol.footwear.tokenStand || 'Shoe stand'})\n`;
    }
    if (stop.coords && stop.coords.length >= 2) {
      text += `   🗺️ *Map Pin:* https://maps.google.com/?q=${stop.coords[0]},${stop.coords[1]}\n`;
    }
    text += `\n`;
  });

  if (regionalEmer && regionalEmer.length) {
    const REGION_TITLES = {
      alluri_paderu: 'ALLURI SITHARAMA RAJU / PADERU / ARAKU',
      tirupati: 'TIRUPATI & TIRUMALA PILGRIM ARMOR',
      visakhapatnam: 'VISAKHAPATNAM COASTAL & MARINE',
      delhi_ncr: 'DELHI NCR CAPITAL CORRIDOR',
      mumbai: 'MUMBAI METROPOLITAN & HARBOR',
      bengaluru: 'BENGALURU TECH & GARDEN CORRIDOR',
      jaipur: 'JAIPUR & RAJASTHAN HERITAGE',
      chennai: 'CHENNAI & COROMANDEL COAST',
      kerala: 'KERALA GODS OWN COUNTRY & GHATS',
      kolkata: 'KOLKATA & BENGAL HERITAGE',
      goa: 'GOA COASTAL & TOURISM ARMOR',
    };
    const regionTitle = REGION_TITLES[regionKey] || city.toUpperCase();
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🛡️ *REGIONAL EMERGENCY ARMOR (${regionTitle})*\n`;
    regionalEmer.forEach(em => {
      text += `• ${em.title}: ${em.num}\n`;
    });
    text += `\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🚨 *EMERGENCY HELPLINES (INDIA)*\n`;
  text += `• Police/Emergency: 112\n`;
  text += `• Tourist Helpline: 1363 (24x7 Multi-lingual)\n`;
  text += `• Women Safety: 1091\n`;
  text += `• Medical Ambulance: 108\n\n`;
  text += `⚡ *Built with India In-Time* — Time & Climate Intelligent Travel`;

  return text;
}

/**
 * Build the full interactive HTML for the Offline Visual Travel Pass modal.
 */
export function buildOfflineTravelPassHtml(mdPlan, currentCityName, dayIdx = 0, cityId = 'visakhapatnam') {
  const day = mdPlan[dayIdx] || mdPlan[0] || [];
  const city = currentCityName || 'India';
  const lingoKey = cityId.includes('vizag') || cityId.includes('hyderabad') || cityId.includes('tirupati') || cityId.includes('vijayawada')
    ? 'telugu'
    : cityId.includes('chennai') || cityId.includes('madurai')
      ? 'tamil'
      : cityId.includes('bangalore') || cityId.includes('bengaluru') || cityId.includes('mysore') || cityId.includes('mysuru')
        ? 'kannada'
        : cityId.includes('mumbai') || cityId.includes('pune')
          ? 'marathi'
          : cityId.includes('kochi') || cityId.includes('munnar') || cityId.includes('kerala') || cityId.includes('alleppey')
            ? 'malayalam'
            : cityId.includes('kolkata') || cityId.includes('howrah')
              ? 'bengali'
              : 'hindi';
  const phrases = SURVIVAL_LINGO[lingoKey] || SURVIVAL_LINGO.hindi;

  return `
    <div class="travel-pass-modal-inner" style="max-height:85vh;overflow-y:auto;padding:16px;color:var(--text-main);">
      <!-- Boarding Pass Style Header -->
      <div class="boarding-pass-card" style="margin-bottom:16px;">
        <div class="bp-top-flight-bar">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.85;">OFFICIAL TRAVEL PASS · DAY ${dayIdx + 1}</div>
            <div class="bp-city-code">${city.slice(0, 3).toUpperCase()}</div>
            <div style="font-size:13px;font-weight:700;">${city}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">STATUS</div>
            <div style="font-size:14px;font-weight:800;background:rgba(0,0,0,0.25);padding:3px 8px;border-radius:6px;display:inline-block;margin-top:2px;">CONFIRMED</div>
            <div style="font-size:11px;opacity:0.9;margin-top:4px;">${day.filter((s) => !s.isBreak).length} Curated Stops</div>
          </div>
        </div>

        <div class="bp-divider-line">
          <div class="bp-notch bp-notch-left"></div>
          <div class="bp-notch bp-notch-right"></div>
        </div>

        <div style="padding:12px 18px 4px;">
          <div class="bp-barcode">||||| | |||| ||| |||||| | |||||</div>
          <div style="text-align:center;font-size:10px;color:var(--text-muted);font-family:'Space Mono',monospace;">IIT-PASS-${Date.now().toString(36).toUpperCase()}</div>
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="itn-btn itnb-green" data-action="printPass" style="flex:1;padding:8px 12px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
          🖨️ Print / Save as PDF
        </button>
        <button class="itn-btn itnb-teal" data-action="shareWhatsAppPass" style="flex:1;padding:8px 12px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
          💬 WhatsApp Pass
        </button>
      </div>

      <!-- Day Stops Detail -->
      <div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        <span>🧭 Planned Timeline & Practical Armor</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
        ${day.length === 0 ? `
          <div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed rgba(255,255,255,0.1);">
            <span style="font-size:24px;display:block;margin-bottom:8px;">🗺️</span>
            <strong>No itinerary stops generated yet for this day.</strong>
            <div style="font-size:11px;margin-top:4px;">Generate an itinerary first to unlock your full offline travel pass and armor checklist.</div>
          </div>
        ` : day.map((stop, i) => {
          if (!stop) return '';
          if (stop.isBreak) {
            return `<div style="background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.15);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text-muted);">
              ☕ <strong>${stop.sts || '--'}</strong> — Rest / Tea Break (${stop.vt || 15}m)
            </div>`;
          }
          const proto = stop.entryProtocol || {};
          const dish = stop.signatureDish || {};
          const ritual = stop.cultural || {};

          return `
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                <div>
                  <span style="background:var(--brand);color:#000;font-size:10px;font-weight:800;border-radius:99px;padding:1px 6px;margin-right:6px;">#${i + 1}</span>
                  <strong style="font-size:14px;color:#fff;">${stop.name}</strong>
                </div>
                <span style="font-size:12px;font-weight:700;color:var(--brand);">${stop.sts || stop.arriveAt || '--'} – ${stop.ets || stop.leaveAt || '--'}</span>
              </div>

              <!-- Cultural & Ritual Note -->
              ${ritual.culturalBadge ? `<div style="font-size:11px;color:#fbbf24;margin-bottom:4px;display:flex;align-items:center;gap:4px;">${ritual.culturalBadge} ${ritual.recommendation ? `— <em>${ritual.recommendation}</em>` : ''}</div>` : ''}

              <!-- Signature Dish -->
              ${dish.dishName ? `
                <div style="font-size:11.5px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.25);border-radius:6px;padding:4px 8px;margin-top:6px;color:#fde047;">
                  🍛 <strong>Must-Try Dish:</strong> ${dish.dishName} at <em>${dish.iconicSpot}</em> (${dish.priceRange || 'Pocket-friendly'})
                  <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">Tip: ${dish.mustTryReason || ''}</div>
                </div>
              ` : ''}

              <!-- Entry Protocol & Travel Armor -->
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;font-size:11px;">
                ${proto.footwear?.requiredOff ? `<span style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);border-radius:4px;padding:2px 6px;">👟 Shoe Stand: ${proto.footwear.tokenStand || 'Required off'}</span>` : '<span style="background:rgba(34,197,94,0.15);color:#86efac;border:1px solid rgba(34,197,94,0.3);border-radius:4px;padding:2px 6px;">👟 Walking Shoes OK</span>'}
                ${proto.dressCode?.strict ? `<span style="background:rgba(168,85,247,0.15);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);border-radius:4px;padding:2px 6px;">👕 ${proto.dressCode.description || 'Modest dress'}</span>` : ''}
                ${proto.security?.cloakroomRequired ? `<span style="background:rgba(249,115,22,0.15);color:#fdba74;border:1px solid rgba(249,115,22,0.3);border-radius:4px;padding:2px 6px;">📱 Lockers Mandatory for Phones</span>` : ''}
                ${proto.tickets?.onlineQr ? `<span style="background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.3);border-radius:4px;padding:2px 6px;">🎟️ ${proto.tickets.onlineQr}</span>` : ''}
              </div>

              ${stop.coords ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;"><a href="https://maps.google.com/?q=${stop.coords[0]},${stop.coords[1]}" target="_blank" style="color:var(--brand);text-decoration:none;">📍 Open Google Maps Pin (${stop.coords[0].toFixed(3)}, ${stop.coords[1].toFixed(3)})</a></div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Regional Emergency Armor (Alluri / Tirupati / Vizag) -->
      ${(() => {
        const regionKey = resolveRegionKey(city, cityId);
        const regionalEmer = regionKey ? EMERGENCY_DIRECTORIES[regionKey] : null;
        if (!regionalEmer || !regionalEmer.length) return '';
        const regionTitle = regionKey === 'alluri_paderu'
          ? 'Alluri Sitharama Raju / Paderu / Araku'
          : regionKey === 'tirupati'
            ? 'Tirupati & Tirumala Pilgrim Security'
            : 'Visakhapatnam Coastal & Marine Ops';
        return `
          <div style="background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.35);border-radius:10px;padding:12px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:700;color:#fde047;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
              <span>🛡️ Regional Emergency Armor: ${regionTitle}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px;">
              ${regionalEmer.map((em) => `
                <div style="display:flex;justify-content:space-between;background:rgba(0,0,0,0.25);padding:4px 8px;border-radius:4px;">
                  <span>${em.icon} ${em.title}</span>
                  <a href="tel:${em.num}" style="color:#fde047;font-weight:800;text-decoration:none;">${em.num}</a>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      })()}

      <!-- Emergency Directory -->
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#fca5a5;margin-bottom:8px;">🚨 Essential Emergency Helplines</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px;">
          ${EMERGENCY_DIRECTORIES.national.map((em) => `
            <div style="display:flex;justify-content:space-between;background:rgba(0,0,0,0.2);padding:4px 8px;border-radius:4px;">
              <span>${em.icon} ${em.title}</span>
              <a href="tel:${em.num}" style="color:#fca5a5;font-weight:800;text-decoration:none;">${em.num}</a>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Local Survival Lingo -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
        <div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;">🗣️ Local Survival Phrases (${lingoKey.toUpperCase()})</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:11.5px;">
          ${phrases.map((p) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="color:var(--text-muted);">${p.en}</span>
              <strong style="color:var(--text-main);">${p.local}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
