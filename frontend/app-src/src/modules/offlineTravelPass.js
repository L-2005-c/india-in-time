// frontend/app-src/src/modules/offlineTravelPass.js
// Generates rich WhatsApp travel share cards and interactive offline printable travel passes.

const EMERGENCY_DIRECTORIES = {
  national: [
    { title: 'National Emergency', num: '112', icon: '🚨' },
    { title: 'Police Assistance', num: '100', icon: '👮' },
    { title: 'Ambulance / Medical', num: '108', icon: '🚑' },
    { title: 'Women Safety Helpline', num: '1091', icon: '🛡️' },
    { title: 'Tourist Helpline (Multi-lingual)', num: '1363', icon: '🧭' },
    { title: 'Railway Helpline', num: '139', icon: '🚆' },
  ],
};

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
};

/**
 * Generate a beautifully structured, emoji-rich WhatsApp itinerary text.
 */
export function generateWhatsAppShareText(mdPlan, currentCityName, dayIdx = 0) {
  if (!mdPlan || !mdPlan.length) return '';
  const day = mdPlan[dayIdx] || mdPlan[0] || [];
  const city = currentCityName || 'India';

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
  const lingoKey = cityId.includes('vizag') || cityId.includes('hyderabad')
    ? 'telugu'
    : cityId.includes('chennai')
      ? 'tamil'
      : cityId.includes('bangalore') || cityId.includes('mysore')
        ? 'kannada'
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
