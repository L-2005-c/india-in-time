const { getFlag, setFlag, clearOverride, listFlags, maintenanceGuard } = require('../lib/featureFlags');

describe('featureFlags', () => {
  afterEach(() => {
    clearOverride('maintenanceMode');
    clearOverride('aiEnabled');
  });

  test('defaults expose known flags', () => {
    const flags = listFlags();
    expect(flags).toHaveProperty('aiEnabled');
    expect(flags).toHaveProperty('maintenanceMode');
  });

  test('setFlag overrides default', () => {
    setFlag('maintenanceMode', true);
    expect(getFlag('maintenanceMode')).toBe(true);
    clearOverride('maintenanceMode');
  });

  test('maintenanceGuard returns 503 when on', () => {
    setFlag('maintenanceMode', true);
    const req = { path: '/api/places' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    maintenanceGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('maintenanceGuard allows health', () => {
    setFlag('maintenanceMode', true);
    const req = { path: '/api/health' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    maintenanceGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('Phase 15 flags are available and normalize casing/underscores', () => {
    const { killSwitch, evaluateCanary } = require('../lib/featureFlags');
    expect(getFlag('TRAFFIC_V2')).toBe(true);
    expect(getFlag('trafficV2')).toBe(true);
    expect(getFlag('poiVerificationV2')).toBe(true);

    killSwitch('TRAFFIC_V2');
    expect(getFlag('TRAFFIC_V2')).toBe(false);
    expect(getFlag('trafficV2')).toBe(false);

    clearOverride('TRAFFIC_V2');
    expect(getFlag('trafficV2')).toBe(true);

    expect(evaluateCanary('trafficV2', 'user_123', 100)).toBe(true);
    expect(evaluateCanary('trafficV2', 'user_123', 0)).toBe(false);
  });
});
