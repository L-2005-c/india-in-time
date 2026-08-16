'use strict';

/**
 * Process orchestration only. Express application wiring stays in server.js.
 * Keeping cluster lifecycle here makes startup/shutdown behavior independently
 * testable and keeps the HTTP composition root small.
 */
function resolveWorkerCount({ env, nodeEnv, logger }) {
  let workers = Number.parseInt(env.CLUSTER_WORKERS, 10) || 1;
  if (workers < 1) workers = 1;

  if (workers > 1 && !env.REDIS_URL) {
    const message =
      'CLUSTER_WORKERS>1 requires REDIS_URL so distributed rate-limit buckets remain shared.';

    if (nodeEnv === 'production') {
      logger.error({ workers }, message);
      throw new Error(message);
    }

    logger.warn({ workers }, `${message} Forcing CLUSTER_WORKERS=1.`);
    workers = 1;
  }

  if (nodeEnv === 'production' && !env.REDIS_URL && workers === 1) {
    logger.warn(
      'REDIS_URL is not configured; running a single worker to preserve rate-limit correctness.'
    );
  }

  return workers;
}

async function startPrimary({
  clusterModule,
  workerCount,
  initDatabase,
  closeDatabase,
  purgeExpiredCache,
  logger,
}) {
  logger.info({ pid: process.pid, workers: workerCount }, 'Primary process starting');

  try {
    await initDatabase();

    try {
      await purgeExpiredCache();
    } catch (err) {
      logger.warn({ err }, 'Expired-cache purge failed during startup');
    }

    for (let i = 0; i < workerCount; i += 1) {
      clusterModule.fork();
    }
  } catch (err) {
    logger.error({ err }, 'Primary database initialization failed');
    process.exitCode = 1;
    return;
  }

  clusterModule.on('exit', (worker, code, signal) => {
    logger.warn(
      { pid: worker.process.pid, code, signal },
      'Worker exited; starting replacement'
    );
    clusterModule.fork();
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Primary received shutdown signal');
    try {
      await closeDatabase();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { resolveWorkerCount, startPrimary };
