// frontend/app-src/src/modules/commandPalette.js
'use strict';

/**
 * Universal Spotlight Command Palette (Cmd+K / Ctrl+K)
 * Fast, keyboard-first action dispatch for India In-Time
 */

export const PALETTE_COMMANDS = [
  // ─── TRAVEL INTELLIGENCE ACTIONS ───
  { id: 'action-monsoon', category: 'Intelligence', title: '1-Tap Monsoon Mode Pivot', subtitle: 'Replace outdoor stops with covered havelis, museums & indoor cafes', icon: '🌧️', actionKey: 'pivotMonsoonMode' },
  { id: 'action-heat', category: 'Intelligence', title: '1-Tap Midday Heat Escape', subtitle: 'Shift 12:00–15:30 outdoor legs to air-conditioned heritage venues', icon: '☀️', actionKey: 'pivotHeatEscapeMode' },
  { id: 'action-wa-pass', category: 'Intelligence', title: 'Export Visual WhatsApp Pass', subtitle: 'Generate emoji-rich itinerary card for travel companions', icon: '💬', actionKey: 'shareWhatsAppPass' },
  { id: 'action-offline-pass', category: 'Intelligence', title: 'Open Offline Travel Pass & Emergency SOS', subtitle: 'Complete offline timeline, helplines & regional lingo', icon: '🎫', actionKey: 'openOfflinePass' },
  { id: 'action-gen-pdf', category: 'Intelligence', title: 'Download Full Trip PDF Guide', subtitle: 'Offline printable travel dossier with GPS bookmarks', icon: '📄', actionKey: 'generateTripPDF' },
  { id: 'action-crowd-radar', category: 'Intelligence', title: 'Live Crowd Prediction Radar', subtitle: 'ML crowd curve and queue bypass recommendations', icon: '👥', actionKey: 'showCrowdPredictor' },
  { id: 'action-hartaal', category: 'Intelligence', title: 'Local Strike & Hartal Alert Scanner', subtitle: 'Check citywide disruption notices and bandh advisories', icon: '🚨', actionKey: 'showHartaalAlert' },

  // ─── POPULAR INDIAN CITIES ───
  { id: 'city-delhi', category: 'Destinations', title: 'Switch Destination: Delhi NCR', subtitle: 'Mughal heritage, monuments, street food & bustling bazaars', icon: '🏛️', type: 'city', cityKey: 'delhi' },
  { id: 'city-mumbai', category: 'Destinations', title: 'Switch Destination: Mumbai', subtitle: 'Colonial architecture, Arabian sea coastline & Bollywood vibes', icon: '🌊', type: 'city', cityKey: 'mumbai' },
  { id: 'city-bengaluru', category: 'Destinations', title: 'Switch Destination: Bengaluru', subtitle: 'Lush gardens, palace heritage & vibrant craft brewing', icon: '🌳', type: 'city', cityKey: 'bengaluru' },
  { id: 'city-jaipur', category: 'Destinations', title: 'Switch Destination: Jaipur (Pink City)', subtitle: 'Royal Rajput hill forts, Amber Palace & Johari Bazaar', icon: '🏰', type: 'city', cityKey: 'jaipur' },
  { id: 'city-varanasi', category: 'Destinations', title: 'Switch Destination: Varanasi (Kashi)', subtitle: 'Sacred Ganga ghats, evening Maha Aarti & silk weavers', icon: '🪔', type: 'city', cityKey: 'varanasi' },
  { id: 'city-visakhapatnam', category: 'Destinations', title: 'Switch Destination: Visakhapatnam (Vizag)', subtitle: 'Scenic coastal drive, Kailasagiri & submarine museum', icon: '⚓', type: 'city', cityKey: 'vizag' },
  { id: 'city-paderu', category: 'Destinations', title: 'Switch Destination: Paderu & Araku Circuit', subtitle: 'Vanjangi cloud sunrise, Borra Caves, Lambasingi mist & coffee estates', icon: '⛰️', type: 'city', cityKey: 'paderu' },
  { id: 'city-tirupati', category: 'Destinations', title: 'Switch Destination: Tirupati & Tirumala Kshetram', subtitle: 'Tirumala Venkateswara Temple, Chandragiri Fort, sacred step footpaths & Talakona', icon: '🛕', type: 'city', cityKey: 'tirupati' },
  { id: 'city-vijayawada', category: 'Destinations', title: 'Switch Destination: Vijayawada', subtitle: 'Kanaka Durga Temple, Krishna riverfront, Bhavani Island & Undavalli Caves', icon: '🌉', type: 'city', cityKey: 'vijayawada' },
  { id: 'city-hyderabad', category: 'Destinations', title: 'Switch Destination: Hyderabad', subtitle: 'Nizam palaces, Golconda sound show & Charminar chai', icon: '💎', type: 'city', cityKey: 'hyderabad' },
  { id: 'city-chennai', category: 'Destinations', title: 'Switch Destination: Chennai', subtitle: 'Marina beach sunrise, Kapaleeshwarar Temple, Dravidian art & filter coffee', icon: '🏛️', type: 'city', cityKey: 'chennai' },
  { id: 'city-kochi', category: 'Destinations', title: 'Switch Destination: Kochi', subtitle: 'Chinese fishing nets, Fort Kochi heritage, Mattancherry & spice markets', icon: '🛶', type: 'city', cityKey: 'kochi' },
  { id: 'city-goa', category: 'Destinations', title: 'Switch Destination: Goa', subtitle: 'Portuguese cathedrals, golden beaches & coastal thalis', icon: '🌴', type: 'city', cityKey: 'goa' },
  { id: 'city-amritsar', category: 'Destinations', title: 'Switch Destination: Amritsar', subtitle: 'Golden Temple Darbar, Wagah Border & kulcha trails', icon: '✨', type: 'city', cityKey: 'amritsar' },
  { id: 'city-agra', category: 'Destinations', title: 'Switch Destination: Agra', subtitle: 'Taj Mahal sunrise, Agra Fort & Fatehpur Sikri', icon: '🕌', type: 'city', cityKey: 'agra' },
  { id: 'city-kolkata', category: 'Destinations', title: 'Switch Destination: Kolkata', subtitle: 'Victoria Memorial, Howrah Bridge & tram heritage', icon: '🚋', type: 'city', cityKey: 'kolkata' },
  { id: 'city-mysore', category: 'Destinations', title: 'Switch Destination: Mysore (Mysuru)', subtitle: 'Amba Vilas 100k-bulb illumination & silk markets', icon: '👑', type: 'city', cityKey: 'mysore' },

  // ─── PRO STUDIO & UTILITIES ───
  { id: 'tool-lingo', category: 'Pro Studio', title: 'Local Dialect Voice Coach', subtitle: 'Audio phrases in Hindi, Telugu, Tamil, Kannada & Marathi', icon: '🗣️', actionKey: 'renderLingo' },
  { id: 'tool-budget', category: 'Pro Studio', title: 'Multi-Currency Budget Burn Engine', subtitle: 'Real-time INR expense tracking, splits & analytics', icon: '💰', actionKey: 'renderBudget' },
  { id: 'tool-safety', category: 'Pro Studio', title: 'Emergency SOS & Safety Directory', subtitle: 'Direct 1-tap dial for 112, 1091, 1363 & geo-tracking', icon: '🛡️', actionKey: 'renderSafety' },
  { id: 'tool-gems', category: 'Pro Studio', title: 'Hidden Gems & Micro-Heritage Radar', subtitle: 'Discover uncrowded secret stepwells and ancient alleys', icon: '💎', actionKey: 'showHiddenGems' },
  { id: 'tool-fare', category: 'Pro Studio', title: 'Auto / Taxi Fare Benchmark Estimator', subtitle: 'Calculate fair local meter fares and prevent surge pricing', icon: '🛺', actionKey: 'showFareNegotiator' },
  { id: 'tool-passport', category: 'Pro Studio', title: 'Digital India Passport & Stamps', subtitle: 'Collect digital heritage badges across 28 states', icon: '🛂', actionKey: 'renderPassport' },

  // ─── SYSTEM & PREFERENCES ───
  { id: 'sys-theme', category: 'System', title: 'Toggle Theme (Dark / Light Obsidian)', subtitle: 'Switch between Velvet Dark and High-Contrast Light mode', icon: '🌓', actionKey: 'toggleTheme' },
  { id: 'sys-locate', category: 'System', title: 'Acquire High-Accuracy GPS Fix', subtitle: 'Calibrate nearest stops with device geospatial sensor', icon: '📍', actionKey: 'locateUser' },
];

/**
 * Filter commands based on query string
 */
export function filterCommands(query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return PALETTE_COMMANDS;
  return PALETTE_COMMANDS.filter((cmd) => {
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });
}

function escapeText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render Command Palette list HTML
 */
export function renderPaletteListHtml(commands = [], selectedIndex = 0) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return `
      <div class="palette-empty">
        <span class="palette-empty-ico">🔍</span>
        <p class="palette-empty-txt">No matching commands or destinations found</p>
        <span class="palette-empty-sub">Try searching "Monsoon", "Jaipur", "Budget", or "Aarti"</span>
      </div>
    `;
  }

  // Group by category
  let html = '';
  let currentCat = '';

  commands.forEach((cmd, idx) => {
    if (!cmd) return;
    if (cmd.category !== currentCat) {
      currentCat = cmd.category || 'General';
      html += `<div class="palette-group-hdr">${escapeText(currentCat)}</div>`;
    }
    const isSelected = idx === selectedIndex;
    const title = escapeText(cmd.title);
    const subtitle = escapeText(cmd.subtitle);
    const icon = escapeText(cmd.icon || '⚡');
    const id = escapeText(cmd.id || `cmd-${idx}`);

    html += `
      <div class="palette-item ${isSelected ? 'selected' : ''}" data-action="execPaletteCmd" data-palette-id="${id}" data-palette-idx="${idx}">
        <span class="palette-item-icon">${icon}</span>
        <div class="palette-item-body">
          <div class="palette-item-title">${title}</div>
          <div class="palette-item-sub">${subtitle}</div>
        </div>
        <span class="palette-shortcut">${isSelected ? '↵ Enter' : ''}</span>
      </div>
    `;
  });

  return html;
}
