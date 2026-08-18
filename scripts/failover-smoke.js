'use strict';

const Redis = require('ioredis');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;

async function main() {
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    console.error('DATABASE_URL and REDIS_URL are required for failover smoke testing.');
    process.exit(2);
  }
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    throw new Error('Production failover test refuses disabled DB TLS verification.');
  }

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
    max: 2,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false,
  });

  try {
    await db.query('SELECT 1');
    await redis.ping();
    console.log('✓ PostgreSQL and Redis baseline connectivity passed');

    // This script deliberately does not mutate or shut down infrastructure.
    // CI/staging orchestrators should inject a failure separately, then rerun it.
    if (process.env.FAILOVER_EXPECTED === 'true') {
      console.log('FAILOVER_EXPECTED=true was supplied; external failure injection must be performed by the staging orchestrator.');
    } else {
      console.log('✓ Safe-mode failover smoke completed (no destructive failure injection).');
    }
  } finally {
    redis.disconnect();
    await db.end();
  }
}

main().catch(err => { console.error(`Failover smoke failed: ${err.message}`); process.exit(1); });
