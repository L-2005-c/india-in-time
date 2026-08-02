// scripts/redis-loadtest/worker-server.js
//
// A minimal Express server that mounts the REAL middleware/rateLimiter.js
// middleware (not a mock) behind a real ioredis client pointed at
// process.env.REDIS_URL. Spawned as a genuinely separate OS process by
// run.js — this is what makes the load test in run.js a test of *cross-
// process* correctness (the exact gap called out in the audit: "multiple
// worker processes, real network latency, real concurrent traffic") rather
// than just concurrent async calls inside one process.
//
// Reads its port from argv[2]. Prints "READY" to stdout once listening so
// the parent process knows when it's safe to start sending traffic.

const express = require('express');
const { createRateLimiter } = require('../../middleware/rateLimiter');

const port = parseInt(process.argv[2], 10);
if (!port) {
  console.error('Usage: node worker-server.js <port>');
  process.exit(1);
}

const app = express();
app.get('/ping', createRateLimiter('general'), (req, res) => {
  res.json({ ok: true, pid: process.pid });
});

const server = app.listen(port, '127.0.0.1', () => {
  console.log('READY');
});

process.on('message', (msg) => {
  if (msg === 'shutdown') {
    server.close(() => process.exit(0));
  }
});
