// frontend/app-src/src/modules/travelDna.js
// Personal Travel DNA Client Module — Privacy-Preserving Traveler Preferences

const DNA_STORAGE_KEY = 'india_in_time_travel_dna';

export const DEFAULT_TRAVEL_DNA = Object.freeze({
  scenic: 75,
  photography: 70,
  food: 75,
  culture: 65,
  adventure: 55,
  shopping: 45,
  crowdTolerance: 50,
  walkingTolerance: 65,
  pacePreference: 'balanced',
  enabled: true,
});

export function getTravelDna() {
  try {
    const raw = localStorage.getItem(DNA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TRAVEL_DNA };
    const parsed = JSON.parse(raw);
    return {
      scenic: Math.max(0, Math.min(100, Number(parsed.scenic) || DEFAULT_TRAVEL_DNA.scenic)),
      photography: Math.max(0, Math.min(100, Number(parsed.photography) || DEFAULT_TRAVEL_DNA.photography)),
      food: Math.max(0, Math.min(100, Number(parsed.food) || DEFAULT_TRAVEL_DNA.food)),
      culture: Math.max(0, Math.min(100, Number(parsed.culture) || DEFAULT_TRAVEL_DNA.culture)),
      adventure: Math.max(0, Math.min(100, Number(parsed.adventure) || DEFAULT_TRAVEL_DNA.adventure)),
      shopping: Math.max(0, Math.min(100, Number(parsed.shopping) || DEFAULT_TRAVEL_DNA.shopping)),
      crowdTolerance: Math.max(0, Math.min(100, Number(parsed.crowdTolerance) || DEFAULT_TRAVEL_DNA.crowdTolerance)),
      walkingTolerance: Math.max(0, Math.min(100, Number(parsed.walkingTolerance) || DEFAULT_TRAVEL_DNA.walkingTolerance)),
      pacePreference: ['relaxed', 'balanced', 'packed'].includes(parsed.pacePreference) ? parsed.pacePreference : 'balanced',
      enabled: parsed.enabled !== false,
    };
  } catch (_e) {
    return { ...DEFAULT_TRAVEL_DNA };
  }
}

export function saveTravelDna(dna) {
  try {
    localStorage.setItem(DNA_STORAGE_KEY, JSON.stringify(dna));
    window.dispatchEvent(new CustomEvent('travel-dna-updated', { detail: dna }));
  } catch (_e) {
    // Storage full or unavailable
  }
}

export function resetTravelDna() {
  saveTravelDna({ ...DEFAULT_TRAVEL_DNA });
  return { ...DEFAULT_TRAVEL_DNA };
}

export function clearTravelDna() {
  try {
    localStorage.removeItem(DNA_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('travel-dna-cleared'));
  } catch (_e) {}
}

export function openTravelDnaModal() {
  let modal = document.getElementById('travel-dna-modal');
  if (!modal) {
    modal = createTravelDnaModalElement();
    document.body.appendChild(modal);
  }
  populateDnaModalFields();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeTravelDnaModal() {
  const modal = document.getElementById('travel-dna-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function populateDnaModalFields() {
  const dna = getTravelDna();
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    const numEl = document.getElementById(`${id}-val`);
    if (el) el.value = val;
    if (numEl) numEl.textContent = `${val}%`;
  };

  setVal('dna-scenic', dna.scenic);
  setVal('dna-photo', dna.photography);
  setVal('dna-food', dna.food);
  setVal('dna-culture', dna.culture);
  setVal('dna-adventure', dna.adventure);
  setVal('dna-shopping', dna.shopping);
  setVal('dna-crowd', dna.crowdTolerance);
  setVal('dna-walking', dna.walkingTolerance);

  const paceEl = document.getElementById('dna-pace');
  if (paceEl) paceEl.value = dna.pacePreference;

  const toggleEl = document.getElementById('dna-enabled');
  if (toggleEl) toggleEl.checked = dna.enabled;
}

function createTravelDnaModalElement() {
  const container = document.createElement('div');
  container.id = 'travel-dna-modal';
  container.className = 'dna-modal-backdrop';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'dna-modal-title');

  container.innerHTML = `
    <div class="dna-modal-card">
      <div class="dna-modal-header">
        <div>
          <h3 id="dna-modal-title" class="dna-modal-title">🧬 Personal Travel DNA</h3>
          <p class="dna-modal-sub">AI adapts recommendations to your intrinsic travel style.</p>
        </div>
        <button id="dna-close-btn" class="dna-close-btn" aria-label="Close modal">✕</button>
      </div>

      <div class="dna-modal-body">
        <div class="dna-privacy-toggle">
          <label class="dna-toggle-label">
            <input type="checkbox" id="dna-enabled" class="dna-checkbox">
            <span class="dna-toggle-text">Enable Travel DNA Personalization</span>
          </label>
          <span class="dna-privacy-badge">🔒 100% On-Device Privacy</span>
        </div>

        <div class="dna-slider-group">
          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🏞️ Scenic Landscapes</span><strong id="dna-scenic-val">75%</strong></div>
            <input type="range" id="dna-scenic" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>📸 Photography & Vantage</span><strong id="dna-photo-val">70%</strong></div>
            <input type="range" id="dna-photo" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🍲 Culinary & Street Food</span><strong id="dna-food-val">75%</strong></div>
            <input type="range" id="dna-food" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🏛️ Heritage & Temples</span><strong id="dna-culture-val">65%</strong></div>
            <input type="range" id="dna-culture" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🥾 Adventure & Trekking</span><strong id="dna-adventure-val">55%</strong></div>
            <input type="range" id="dna-adventure" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🛍️ Shopping & Bazaars</span><strong id="dna-shopping-val">45%</strong></div>
            <input type="range" id="dna-shopping" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🧘 Crowd Tolerance (Low = Quiet)</span><strong id="dna-crowd-val">50%</strong></div>
            <input type="range" id="dna-crowd" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-slider-row">
            <div class="dna-slider-label"><span>🚶 Walking Willingness</span><strong id="dna-walking-val">65%</strong></div>
            <input type="range" id="dna-walking" min="0" max="100" class="dna-slider">
          </div>

          <div class="dna-select-row">
            <label for="dna-pace" class="dna-select-label">⚡ Itinerary Pace</label>
            <select id="dna-pace" class="dna-select">
              <option value="relaxed">🌿 Relaxed (Spacious pauses)</option>
              <option value="balanced" selected>⚖️ Balanced (Recommended)</option>
              <option value="packed">🚀 Packed (Max sights)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="dna-modal-footer">
        <button id="dna-reset-btn" class="dna-btn-secondary">Reset</button>
        <button id="dna-save-btn" class="dna-btn-primary">Save Preferences</button>
      </div>
    </div>
  `;

  // Attach event listeners
  const closeBtn = container.querySelector('#dna-close-btn');
  closeBtn.addEventListener('click', closeTravelDnaModal);

  const sliders = [
    'dna-scenic', 'dna-photo', 'dna-food', 'dna-culture',
    'dna-adventure', 'dna-shopping', 'dna-crowd', 'dna-walking'
  ];

  sliders.forEach(id => {
    const slider = container.querySelector(`#${id}`);
    const label = container.querySelector(`#${id}-val`);
    if (slider && label) {
      slider.addEventListener('input', () => {
        label.textContent = `${slider.value}%`;
      });
    }
  });

  const saveBtn = container.querySelector('#dna-save-btn');
  saveBtn.addEventListener('click', () => {
    const dna = {
      scenic: Number(container.querySelector('#dna-scenic')?.value || 70),
      photography: Number(container.querySelector('#dna-photo')?.value || 70),
      food: Number(container.querySelector('#dna-food')?.value || 70),
      culture: Number(container.querySelector('#dna-culture')?.value || 65),
      adventure: Number(container.querySelector('#dna-adventure')?.value || 50),
      shopping: Number(container.querySelector('#dna-shopping')?.value || 45),
      crowdTolerance: Number(container.querySelector('#dna-crowd')?.value || 50),
      walkingTolerance: Number(container.querySelector('#dna-walking')?.value || 65),
      pacePreference: container.querySelector('#dna-pace')?.value || 'balanced',
      enabled: !!container.querySelector('#dna-enabled')?.checked,
    };
    saveTravelDna(dna);
    closeTravelDnaModal();
  });

  const resetBtn = container.querySelector('#dna-reset-btn');
  resetBtn.addEventListener('click', () => {
    resetTravelDna();
    populateDnaModalFields();
  });

  container.addEventListener('click', (e) => {
    if (e.target === container) closeTravelDnaModal();
  });

  return container;
}
