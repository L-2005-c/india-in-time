'use strict';
const logger = require('./logger');
const REGION = process.env.REGION || process.env.FLY_REGION || process.env.RENDER_REGION || 'primary';
const IS_PRIMARY = (process.env.REGION_ROLE || 'primary') !== 'replica';

function getRegionInfo() {
  return {
    region: REGION,
    role: IS_PRIMARY ? 'primary' : 'replica',
    readReplicaConfigured: !!process.env.DATABASE_URL_READ,
    redisConfigured: !!process.env.REDIS_URL,
    multiInstanceSafe: !!process.env.REDIS_URL || process.env.CLUSTER_WORKERS === '1',
  };
}

function assertHaConfig() {
  if (process.env.NODE_ENV === 'production' && (process.env.REQUIRE_REDIS_IN_PROD === '1' || process.env.REQUIRE_REDIS_IN_PROD === 'true')) {
    if (!process.env.REDIS_URL) {
      logger.fatal('REQUIRE_REDIS_IN_PROD set but REDIS_URL missing');
      process.exit(1);
    }
  }
}

function getReadDatabaseUrl() {
  return process.env.DATABASE_URL_READ || process.env.DATABASE_URL || null;
}

module.exports = { getRegionInfo, assertHaConfig, getReadDatabaseUrl, REGION, IS_PRIMARY };
