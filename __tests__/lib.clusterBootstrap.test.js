jest.mock('../lib/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const { resolveWorkerCount, startPrimary } = require('../lib/clusterBootstrap');

describe('cluster bootstrap', () => {
  test('forces one worker outside production when Redis is unavailable', () => {
    const logger = require('../lib/logger');
    expect(
      resolveWorkerCount({
        env: { CLUSTER_WORKERS: '4' },
        nodeEnv: 'test',
        logger,
      })
    ).toBe(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('rejects multi-worker production without Redis', () => {
    const logger = require('../lib/logger');
    expect(() =>
      resolveWorkerCount({
        env: { CLUSTER_WORKERS: '4' },
        nodeEnv: 'production',
        logger,
      })
    ).toThrow(/requires REDIS_URL/);
  });

  test('allows multi-worker production with Redis', () => {
    const logger = require('../lib/logger');
    expect(
      resolveWorkerCount({
        env: { CLUSTER_WORKERS: '4', REDIS_URL: 'redis://localhost:6379' },
        nodeEnv: 'production',
        logger,
      })
    ).toBe(4);
  });

  test('primary startup initializes DB, purges cache, then forks workers', async () => {
    const clusterModule = {
      fork: jest.fn(),
      on: jest.fn(),
    };
    const initDatabase = jest.fn().mockResolvedValue(undefined);
    const closeDatabase = jest.fn().mockResolvedValue(undefined);
    const purgeExpiredCache = jest.fn().mockResolvedValue(undefined);
    const logger = require('../lib/logger');

    await startPrimary({
      clusterModule,
      workerCount: 2,
      initDatabase,
      closeDatabase,
      purgeExpiredCache,
      logger,
    });

    expect(initDatabase).toHaveBeenCalled();
    expect(purgeExpiredCache).toHaveBeenCalled();
    expect(clusterModule.fork).toHaveBeenCalledTimes(2);
  });
});
