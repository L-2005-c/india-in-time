/**
 * frontend/app-src/src/modules/journeyLaunchpad.js
 *
 * India In-Time v3.0 — Phase 8A Journey Launchpad (Pre-Trip Empty State)
 *
 * Provides a rich, inspiring traveler launchpad before a trip is planned:
 * 1. Hero with active city context and verified weather state
 * 2. Primary CTA: [Plan a Custom Trip] and [Preview Sample Journey]
 * 3. Curated city route concepts (labeled CURATED ROUTE / SAMPLE)
 * 4. India In-Time feature highlights (Trust, Deadlines, Dining, Safety)
 *
 * Non-negotiable: Sample journey is strictly isolated and labeled SIMULATED / PREVIEW.
 * It does not mutate real traveler database state.
 */

const CURATED_CITY_ROUTES = {
  visakhapatnam: [
    {
      id: 'vizag-coastal',
      title: 'Coastal Sunrise & Beach Cruise',
      tag: 'CURATED ROUTE',
      duration: '4.5 hrs',
      distance: '28 km',
      stops: ['RK Beach', 'INS Kursura Submarine', 'Kailasagiri Hilltop', 'Rushikonda Beach'],
      vibe: 'Scenic & Relaxed',
      icon: '🌊',
      desc: 'Iconic coastal corridor following the Bay of Bengal coastline with scenic viewpoints and marine heritage.',
    },
    {
      id: 'vizag-araku',
      title: 'Araku Valley Mountain Loop',
      tag: 'CURATED ROUTE',
      duration: '7.0 hrs',
      distance: '115 km',
      stops: ['Tyda Jungle Camp', 'Borra Caves', 'Araku Coffee Museum', 'Katiki Waterfalls'],
      vibe: 'Adventure & Nature',
      icon: '⛰️',
      desc: 'Highland ghat drive traversing the Eastern Ghats with limestone caves, tribal heritage, and coffee estates.',
    },
    {
      id: 'vizag-heritage',
      title: 'Heritage & Temple Trail',
      tag: 'CURATED ROUTE',
      duration: '5.0 hrs',
      distance: '42 km',
      stops: ['Simhachalam Temple', 'Thotlakonda Buddhist Ruins', "Dolphin's Nose Lighthouse"],
      vibe: 'Cultural & Sacred',
      icon: '🛕',
      desc: 'Millennium-old architectural landmarks and Buddhist monastic heritage perched on coastal cliffs.',
    },
  ],
  bengaluru: [
    {
      id: 'blr-gardens',
      title: 'Garden City & Historic Core',
      tag: 'CURATED ROUTE',
      duration: '5.0 hrs',
      distance: '22 km',
      stops: ['Lalbagh Botanical Garden', 'Bengaluru Fort', 'Tipu Sultan Palace', 'Cubbon Park'],
      vibe: 'Heritage & Greenery',
      icon: '🌳',
      desc: 'Historic royal avenues, colonial botanical glasshouses, and Old Bengaluru cultural corridors.',
    },
  ],
  mumbai: [
    {
      id: 'mum-south',
      title: 'South Mumbai Heritage Walk',
      tag: 'CURATED ROUTE',
      duration: '4.0 hrs',
      distance: '16 km',
      stops: ['Gateway of India', 'Colaba Causeway', 'Marine Drive', 'Chhatrapati Shivaji Terminus'],
      vibe: 'Art Deco & Sea',
      icon: '🏛️',
      desc: 'Victorian Gothic architecture, seaside promenade, and historic harbor landmarks.',
    },
  ],
};

/**
 * Renders the Journey Launchpad pre-trip container.
 */
export function renderJourneyLaunchpad({
  cityName = 'Visakhapatnam',
  weatherState = null,
  onPlanTrip = null,
  onPreviewSample = null,
} = {}) {
  const container = document.createElement('div');
  container.id = 'journey-launchpad-inner';
  container.className = 'journey-launchpad-container';
  container.style.maxWidth = '680px';
  container.style.margin = '0 auto';
  container.style.padding = '10px 4px 60px';

  const cityKey = (cityName || 'visakhapatnam').toLowerCase();
  const routes = CURATED_CITY_ROUTES[cityKey] || CURATED_CITY_ROUTES.visakhapatnam;

  // ── 1. Hero Card ──────────────────────────────────────────────────────────
  const hero = document.createElement('div');
  hero.className = 'launchpad-hero-card';
  hero.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)';
  hero.style.border = '1px solid rgba(139, 92, 246, 0.25)';
  hero.style.borderRadius = '18px';
  hero.style.padding = '22px 20px';
  hero.style.marginBottom = '20px';
  hero.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.25)';

  const heroBadge = document.createElement('div');
  heroBadge.style.display = 'inline-flex';
  heroBadge.style.alignItems = 'center';
  heroBadge.style.gap = '6px';
  heroBadge.style.fontSize = '11px';
  heroBadge.style.fontWeight = '800';
  heroBadge.style.letterSpacing = '0.5px';
  heroBadge.style.textTransform = 'uppercase';
  heroBadge.style.color = '#a78bfa';
  heroBadge.style.background = 'rgba(139, 92, 246, 0.2)';
  heroBadge.style.padding = '3px 10px';
  heroBadge.style.borderRadius = '12px';
  heroBadge.style.marginBottom = '12px';
  heroBadge.innerHTML = '<span>🧭</span> Smart Traveler Companion';
  hero.appendChild(heroBadge);

  const heroTitle = document.createElement('h2');
  heroTitle.style.fontSize = '22px';
  heroTitle.style.fontWeight = '800';
  heroTitle.style.lineHeight = '1.3';
  heroTitle.style.margin = '0 0 8px';
  heroTitle.style.color = '#f8fafc';
  heroTitle.textContent = `Ready to explore ${cityName} in-time?`;
  hero.appendChild(heroTitle);

  const heroSubtitle = document.createElement('p');
  heroSubtitle.style.fontSize = '13px';
  heroSubtitle.style.color = '#cbd5e1';
  heroSubtitle.style.margin = '0 0 16px';
  heroSubtitle.style.lineHeight = '1.5';
  heroSubtitle.textContent = 'Intelligent itinerary pacing with real-time corridor safety, verified tourist trust, and highway dining interception.';
  hero.appendChild(heroSubtitle);

  // Weather pill
  const weatherPill = document.createElement('div');
  weatherPill.style.display = 'inline-flex';
  weatherPill.style.alignItems = 'center';
  weatherPill.style.gap = '8px';
  weatherPill.style.background = 'rgba(255, 255, 255, 0.05)';
  weatherPill.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  weatherPill.style.borderRadius = '20px';
  weatherPill.style.padding = '6px 14px';
  weatherPill.style.fontSize = '12px';
  weatherPill.style.color = '#94a3b8';
  weatherPill.style.marginBottom = '18px';

  if (weatherState && weatherState.temp != null) {
    const icon = weatherState.icon || '☀️';
    const condition = weatherState.condition || 'Clear';
    weatherPill.innerHTML = `<span>${icon}</span> <strong style="color:#f8fafc;">${weatherState.temp}°C</strong> <span>• ${condition} in ${cityName}</span>`;
  } else {
    weatherPill.innerHTML = '<span>🌦️</span> <span>Weather update ready on plan creation</span>';
  }
  hero.appendChild(weatherPill);

  // Hero Actions
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '10px';
  btnRow.style.flexWrap = 'wrap';

  const planBtn = document.createElement('button');
  planBtn.id = 'launchpad-btn-plan';
  planBtn.type = 'button';
  planBtn.style.flex = '1';
  planBtn.style.minWidth = '140px';
  planBtn.style.background = 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)';
  planBtn.style.color = '#fff';
  planBtn.style.border = 'none';
  planBtn.style.borderRadius = '12px';
  planBtn.style.padding = '12px 18px';
  planBtn.style.fontSize = '13px';
  planBtn.style.fontWeight = '800';
  planBtn.style.cursor = 'pointer';
  planBtn.style.display = 'inline-flex';
  planBtn.style.alignItems = 'center';
  planBtn.style.justifyContent = 'center';
  planBtn.style.gap = '8px';
  planBtn.style.boxShadow = '0 6px 18px rgba(124, 58, 237, 0.35)';
  planBtn.innerHTML = '<span>🚀</span> Plan a Custom Trip';
  planBtn.addEventListener('click', () => {
    if (typeof onPlanTrip === 'function') onPlanTrip();
  });
  btnRow.appendChild(planBtn);

  const previewBtn = document.createElement('button');
  previewBtn.id = 'launchpad-btn-preview';
  previewBtn.type = 'button';
  previewBtn.style.flex = '1';
  previewBtn.style.minWidth = '140px';
  previewBtn.style.background = 'rgba(255, 255, 255, 0.06)';
  previewBtn.style.color = '#e2e8f0';
  previewBtn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  previewBtn.style.borderRadius = '12px';
  previewBtn.style.padding = '12px 18px';
  previewBtn.style.fontSize = '13px';
  previewBtn.style.fontWeight = '700';
  previewBtn.style.cursor = 'pointer';
  previewBtn.style.display = 'inline-flex';
  previewBtn.style.alignItems = 'center';
  previewBtn.style.justifyContent = 'center';
  previewBtn.style.gap = '8px';
  previewBtn.innerHTML = '<span>✨</span> Preview Sample Journey';
  previewBtn.addEventListener('click', () => {
    if (typeof onPreviewSample === 'function') onPreviewSample(routes[0]);
  });
  btnRow.appendChild(previewBtn);

  hero.appendChild(btnRow);
  container.appendChild(hero);

  // ── 2. Curated City Itineraries ───────────────────────────────────────────
  const routesSection = document.createElement('div');
  routesSection.style.marginBottom = '22px';

  const sectionHead = document.createElement('div');
  sectionHead.style.display = 'flex';
  sectionHead.style.justifyContent = 'space-between';
  sectionHead.style.alignItems = 'center';
  sectionHead.style.marginBottom = '12px';

  const sectionTitle = document.createElement('h3');
  sectionTitle.style.fontSize = '15px';
  sectionTitle.style.fontWeight = '800';
  sectionTitle.style.margin = '0';
  sectionTitle.style.color = '#f8fafc';
  sectionTitle.innerHTML = `<span>📍</span> Curated Routes in ${cityName}`;

  const sampleTag = document.createElement('span');
  sampleTag.style.fontSize = '10px';
  sampleTag.style.fontWeight = '700';
  sampleTag.style.color = '#94a3b8';
  sampleTag.style.background = 'rgba(255, 255, 255, 0.05)';
  sampleTag.style.padding = '2px 8px';
  sampleTag.style.borderRadius = '6px';
  sampleTag.textContent = 'SAMPLE ITINERARIES';

  sectionHead.appendChild(sectionTitle);
  sectionHead.appendChild(sampleTag);
  routesSection.appendChild(sectionHead);

  const routesGrid = document.createElement('div');
  routesGrid.style.display = 'grid';
  routesGrid.style.gridTemplateColumns = '1fr';
  routesGrid.style.gap = '12px';

  routes.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'curated-route-card';
    card.style.background = 'rgba(255, 255, 255, 0.03)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    card.style.borderRadius = '14px';
    card.style.padding = '14px 16px';
    card.style.transition = 'all 0.2s ease';

    const cardTop = document.createElement('div');
    cardTop.style.display = 'flex';
    cardTop.style.justifyContent = 'space-between';
    cardTop.style.alignItems = 'flex-start';
    cardTop.style.marginBottom = '8px';

    const cardTitleGroup = document.createElement('div');
    const cTitle = document.createElement('strong');
    cTitle.style.fontSize = '14px';
    cTitle.style.color = '#f8fafc';
    cTitle.style.display = 'block';
    cTitle.style.marginBottom = '2px';
    cTitle.textContent = `${r.icon} ${r.title}`;

    const cMeta = document.createElement('span');
    cMeta.style.fontSize = '11px';
    cMeta.style.color = '#a78bfa';
    cMeta.textContent = `⏱️ ${r.duration} • 🛣️ ${r.distance} • ${r.vibe}`;

    cardTitleGroup.appendChild(cTitle);
    cardTitleGroup.appendChild(cMeta);

    const cTag = document.createElement('span');
    cTag.style.fontSize = '9px';
    cTag.style.fontWeight = '800';
    cTag.style.color = '#38bdf8';
    cTag.style.background = 'rgba(56, 189, 248, 0.12)';
    cTag.style.padding = '2px 6px';
    cTag.style.borderRadius = '4px';
    cTag.textContent = r.tag;

    cardTop.appendChild(cardTitleGroup);
    cardTop.appendChild(cTag);
    card.appendChild(cardTop);

    const cDesc = document.createElement('p');
    cDesc.style.fontSize = '11.5px';
    cDesc.style.color = '#94a3b8';
    cDesc.style.margin = '0 0 10px';
    cDesc.style.lineHeight = '1.45';
    cDesc.textContent = r.desc;
    card.appendChild(cDesc);

    // Stop pills
    const stopsWrap = document.createElement('div');
    stopsWrap.style.display = 'flex';
    stopsWrap.style.flexWrap = 'wrap';
    stopsWrap.style.gap = '5px';
    stopsWrap.style.marginBottom = '12px';

    r.stops.forEach((st, idx) => {
      const stPill = document.createElement('span');
      stPill.style.fontSize = '10px';
      stPill.style.background = 'rgba(255, 255, 255, 0.04)';
      stPill.style.border = '1px solid rgba(255, 255, 255, 0.08)';
      stPill.style.borderRadius = '6px';
      stPill.style.padding = '2px 8px';
      stPill.style.color = '#e2e8f0';
      stPill.textContent = `${idx + 1}. ${st}`;
      stopsWrap.appendChild(stPill);
    });
    card.appendChild(stopsWrap);

    // Preview action button
    const cardBtn = document.createElement('button');
    cardBtn.type = 'button';
    cardBtn.style.width = '100%';
    cardBtn.style.background = 'rgba(139, 92, 246, 0.12)';
    cardBtn.style.border = '1px solid rgba(139, 92, 246, 0.25)';
    cardBtn.style.borderRadius = '8px';
    cardBtn.style.padding = '8px 12px';
    cardBtn.style.fontSize = '11.5px';
    cardBtn.style.fontWeight = '700';
    cardBtn.style.color = '#c4b5fd';
    cardBtn.style.cursor = 'pointer';
    cardBtn.style.display = 'flex';
    cardBtn.style.alignItems = 'center';
    cardBtn.style.justifyContent = 'center';
    cardBtn.style.gap = '6px';
    cardBtn.innerHTML = '<span>👁️</span> Preview This Route (Sample)';
    cardBtn.addEventListener('click', () => {
      if (typeof onPreviewSample === 'function') onPreviewSample(r);
    });
    card.appendChild(cardBtn);

    routesGrid.appendChild(card);
  });

  routesSection.appendChild(routesGrid);
  container.appendChild(routesSection);

  // ── 3. What Makes India In-Time Different ────────────────────────────────
  const featsSection = document.createElement('div');
  featsSection.style.background = 'rgba(255, 255, 255, 0.02)';
  featsSection.style.border = '1px solid rgba(255, 255, 255, 0.06)';
  featsSection.style.borderRadius = '14px';
  featsSection.style.padding = '16px';

  const featsTitle = document.createElement('div');
  featsTitle.style.fontSize = '13px';
  featsTitle.style.fontWeight = '800';
  featsTitle.style.color = '#f8fafc';
  featsTitle.style.marginBottom = '10px';
  featsTitle.innerHTML = '<span>🧠</span> Intelligent Travel Decision Engine';
  featsSection.appendChild(featsTitle);

  const features = [
    { icon: '⏱️', title: 'Dynamic Travel Decisions', desc: 'Adapts arrival & visit pacing to real-time traffic and weather conditions.' },
    { icon: '🍛', title: 'Smart Dining Interception', desc: 'Schedules high-hygiene highway meal stops right inside your route corridor.' },
    { icon: '🛡️', title: 'Tourist Trust Verification', desc: 'Deterministic coordinate verification and transparent fare decomposition.' },
    { icon: '🚆', title: 'Transport Deadline Awareness', desc: 'Maintains verified safe buffers for flight and train departures.' },
  ];

  const featsGrid = document.createElement('div');
  featsGrid.style.display = 'grid';
  featsGrid.style.gridTemplateColumns = '1fr 1fr';
  featsGrid.style.gap = '10px';

  features.forEach((f) => {
    const fCard = document.createElement('div');
    fCard.style.padding = '8px 10px';
    fCard.style.background = 'rgba(255, 255, 255, 0.02)';
    fCard.style.borderRadius = '8px';

    const fTop = document.createElement('div');
    fTop.style.fontSize = '11px';
    fTop.style.fontWeight = '700';
    fTop.style.color = '#e2e8f0';
    fTop.style.display = 'flex';
    fTop.style.alignItems = 'center';
    fTop.style.gap = '5px';
    fTop.style.marginBottom = '2px';
    fTop.innerHTML = `<span>${f.icon}</span> <span>${f.title}</span>`;

    const fDesc = document.createElement('p');
    fDesc.style.fontSize = '10px';
    fDesc.style.color = '#94a3b8';
    fDesc.style.margin = '0';
    fDesc.style.lineHeight = '1.4';
    fDesc.textContent = f.desc;

    fCard.appendChild(fTop);
    fCard.appendChild(fDesc);
    featsGrid.appendChild(fCard);
  });

  featsSection.appendChild(featsGrid);
  container.appendChild(featsSection);

  return container;
}
