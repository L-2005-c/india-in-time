// __tests__/services.entryProtocolEngine.test.js
'use strict';

const { getEntryProtocol, ENTRY_PROTOCOL_DATA } = require('../services/travelIntelligence/entryProtocolEngine');

describe('entryProtocolEngine', () => {
  test('returns shoe token, dress code, and camera rules for Simhachalam', () => {
    const proto = getEntryProtocol({ name: 'Simhachalam Temple', cat: 'temple' });
    expect(proto).toBeTruthy();
    expect(proto.footwear.requiredOff).toBe(true);
    expect(proto.footwear.socksTip).toBeTruthy();
    expect(proto.dressCode.strict).toBe(true);
    expect(proto.security.innerSanctumCamerasBanned).toBe(true);
  });

  test('identifies strict zero electronics & locker rule for Akshardham and Birla Mandir', () => {
    const akshardham = getEntryProtocol({ name: 'Swaminarayan Akshardham', cat: 'temple' });
    expect(akshardham.security.mobileAllowed).toBe(false);
    expect(akshardham.security.cloakroomRequired).toBe(true);

    const birla = getEntryProtocol({ name: 'Birla Mandir', cat: 'temple' });
    expect(birla.security.mobileAllowed).toBe(false);
  });

  test('identifies mandatory head cover for Golden Temple', () => {
    const gt = getEntryProtocol({ name: 'Golden Temple', cat: 'temple' });
    expect(gt.dressCode.headCoverMandatory).toBe(true);
    expect(gt.footwear.washFeetPool).toBeTruthy();
  });

  test('identifies online ASI QR ticket requirement for Golconda Fort', () => {
    const golconda = getEntryProtocol({ name: 'Golconda Fort', cat: 'fort' });
    expect(golconda.tickets.onlineQr).toContain('ASI');
    expect(golconda.footwear.terrainTip).toBeTruthy();
  });

  test('falls back gracefully to category heuristics for unlisted monuments', () => {
    const fort = getEntryProtocol({ name: 'Old Hilltop Citadel', cat: 'fort' });
    expect(fort.footwear.requiredOff).toBe(false);
    expect(fort.matchedBy).toBe('category_fallback');
  });
});
