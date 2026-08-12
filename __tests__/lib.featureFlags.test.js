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
});
