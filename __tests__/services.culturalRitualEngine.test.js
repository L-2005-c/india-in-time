// __tests__/services.culturalRitualEngine.test.js
'use strict';

const { getCulturalRitualIntel } = require('../services/travelIntelligence/culturalRitualEngine');

describe('culturalRitualEngine', () => {
  test('accurately identifies evening aarti window for Varanasi Ghats', () => {
    const place = { name: 'Dashashwamedh Ghat', cat: 'temple' };
    const intel = getCulturalRitualIntel(place, 19 * 60, 0); // 19:00 (7:00 PM)

    expect(intel).toBeTruthy();
    expect(intel.activeAarti).toBeTruthy();
    expect(intel.activeAarti.name).toContain('Ganga Aarti');
    expect(intel.culturalBadge).toContain('Ganga Aarti');
    expect(intel.isSanctumClosed).toBe(false);
  });

  test('flags afternoon sanctum closure / naivedyam rest for temples', () => {
    const place = { name: 'Simhachalam Temple', cat: 'temple' };
    const intel = getCulturalRitualIntel(place, 13 * 60 + 30, 2); // 13:30 (1:30 PM)

    expect(intel).toBeTruthy();
    expect(intel.isSanctumClosed).toBe(true);
    expect(intel.recommendation).toContain('sanctum');
  });

  test('detects light and sound show for Golconda Fort in evening', () => {
    const place = { name: 'Golconda Fort', cat: 'fort' };
    const intel = getCulturalRitualIntel(place, 19 * 60, 4); // 19:00

    expect(intel).toBeTruthy();
    expect(intel.activeShow).toBeTruthy();
    expect(intel.activeShow.name).toContain('Light & Sound Show');
    expect(intel.culturalBadge).toContain('Light & Sound Show');
  });

  test('provides Sunday illumination for Mysore Palace', () => {
    const place = { name: 'Mysore Palace', cat: 'scenic' };
    const sundayIntel = getCulturalRitualIntel(place, 19 * 60 + 15, 0); // Sunday 19:15
    const mondayIntel = getCulturalRitualIntel(place, 19 * 60 + 15, 1); // Monday 19:15

    expect(sundayIntel.activeShow.name).toContain('Illumination');
    expect(mondayIntel.activeShow.name).toContain('Sound & Light Show');
  });

  test('falls back gracefully to category heuristics for unlisted temples', () => {
    const place = { name: 'Ancient Village Temple', cat: 'temple' };
    const intel = getCulturalRitualIntel(place, 18 * 60 + 30, 3);

    expect(intel).toBeTruthy();
    expect(intel.prasad).toBeTruthy();
    expect(intel.dressCode).toBeTruthy();
  });
});
