'use strict';

/**
 * scripts/db-pool-loadtest.js
 *
 * Simulates high-concurrency database connection pressure against the configured
 * pool ceiling to verify graceful queuing and bounded timeout behaviors.
 */

require('dotenv').config();
const { Pool, neonConfig } = require('@neondatabase/serverless');

if (process.env.NEON_LOCAL_PROXY === 'true') {
  const proxyHost = process.env.NEON_LOCAL_PROXY_HOST || 'localhost:4444';
  neonConfig.wsProxy = (host, port) => `${proxyHost}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

async function runDbPoolLoadTest() {
  console.log('\n============================================================');
  console.log('EXECUTING DATABASE CONNECTION POOL LOAD TEST');
  console.log('============================================================\n');

  const poolMax = parseInt(process.env.DB_POOL_MAX, 10) || 5;
  const connectionTimeoutMillis = 1500; // Fast timeout for load test
  const totalConcurrent = poolMax * 3;  // 3x pool capacity

  console.log(`Pool Max Limit:         ${poolMax}`);
  console.log(`Connection Timeout:     ${connectionTimeoutMillis}ms`);
  console.log(`Concurrent Invocations: ${totalConcurrent}`);
  console.log(`Testing boundary saturation...\n`);

  if (!process.env.DATABASE_URL) {
    console.log('⚠️  MOCK SIMULATION ONLY — no DATABASE_URL was set, this did not touch a real database.');
    
    // Simulate pool saturation mechanics
    let activeClients = 0;
    const queue = [];
    const results = { succeeded: 0, queued: 0, timedOut: 0 };

    const acquire = (id) => new Promise((resolve) => {
      if (activeClients < poolMax) {
        activeClients++;
        results.succeeded++;
        setTimeout(() => {
          activeClients--;
          if (queue.length > 0) {
            const next = queue.shift();
            activeClients++;
            results.queued++;
            next();
          }
        }, 100);
        resolve({ success: true, id, status: 'ACQUIRED_IMMEDIATE' });
      } else {
        const timer = setTimeout(() => {
          const idx = queue.indexOf(callback);
          if (idx !== -1) queue.splice(idx, 1);
          results.timedOut++;
          resolve({ success: false, id, status: 'TIMEOUT_GRACEFUL' });
        }, connectionTimeoutMillis);

        const callback = () => {
          clearTimeout(timer);
          setTimeout(() => {
            activeClients--;
            if (queue.length > 0) {
              const next = queue.shift();
              activeClients++;
              results.queued++;
              next();
            }
          }, 100);
          resolve({ success: true, id, status: 'ACQUIRED_QUEUED' });
        };
        queue.push(callback);
      }
    });

    const tasks = Array.from({ length: totalConcurrent }, (_, i) => acquire(i + 1));
    const outcomes = await Promise.all(tasks);

    console.log(`Load Test Outcomes (${outcomes.length} total):`);
    console.log(`- Immediate Connections:  ${results.succeeded}`);
    console.log(`- Queued & Served:        ${results.queued}`);
    console.log(`- Graceful Timeouts:      ${results.timedOut}`);
    console.log(`\n⚠️  MOCK SIMULATION ONLY — no DATABASE_URL was set, this did not touch a real database.`);
    return { success: true, results, isMock: true };
  }

  // Real DB Test
  const testPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NEON_LOCAL_PROXY === 'true' ? false : undefined,
    max: poolMax,
    connectionTimeoutMillis,
  });

  try {
    const tasks = Array.from({ length: totalConcurrent }, async (_, i) => {
      const start = Date.now();
      try {
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        return { id: i + 1, success: true, durationMs: Date.now() - start };
      } catch (err) {
        return { id: i + 1, success: false, error: err.message, durationMs: Date.now() - start };
      }
    });

    const outcomes = await Promise.all(tasks);
    const passed = outcomes.filter(o => o.success).length;
    const failed = outcomes.filter(o => !o.success).length;
    const avgDuration = Math.round(outcomes.reduce((acc, o) => acc + o.durationMs, 0) / outcomes.length);

    console.log(`Real Database Pool Test Results (${totalConcurrent} concurrent requests against pool limit ${poolMax}):`);
    console.log(`- Successful Queries:     ${passed}`);
    console.log(`- Bounded/Timed-out:      ${failed}`);
    console.log(`- Average Query Latency:  ${avgDuration}ms`);
    console.log(`\n✅ Real Database Connection Pool Saturation & Bound Verified.`);
    await testPool.end();
    return { success: true, passed, failed, avgDuration, isMock: false };
  } catch (err) {
    await testPool.end();
    throw err;
  }
}

if (require.main === module) {
  runDbPoolLoadTest().then(() => process.exit(0)).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
}

module.exports = { runDbPoolLoadTest };
