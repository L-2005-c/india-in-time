'use strict';
const fs = require('fs');
const path = require('path');
let failed = 0;
const root = path.join(__dirname, '..');
function check(name, ok, detail='') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
check('Node engine is supported', /^20\.x \|\| 22\.x$/.test(pkg.engines?.node || ''));
check('Lockfile exists', fs.existsSync(path.join(root, 'package-lock.json')));
check('CI workflow exists', fs.existsSync(path.join(root, '.github/workflows/ci.yml')));
check('Production migration exists', fs.existsSync(path.join(root, 'migrations/1700000005000-production-hardening.js')));
check('Production rate limiting requires Redis', /requireRedisInProd: process\.env\.REQUIRE_REDIS_IN_PROD !== 'false'/.test(read('config/index.js')));
check('Production DB TLS verification cannot be disabled silently', /DATABASE_SSL_REJECT_UNAUTHORIZED/.test(read('db/init.js')) && /not allowed in production/.test(read('db/init.js')));
check('CSP script-src has no unsafe-inline', !/scriptSrc:\s*\[[^\]]*'unsafe-inline'/.test(read('middleware/security.js')));
check('No shared admin authentication path remains', !/x-admin-key|ADMIN_FEEDBACK_KEY|allowLegacyAdminKey|requireAdminKey/.test(read('middleware/adminAuth.js') + '\n' + read('config/index.js')));
check('Persistent AI cache has expiry', /expires_at/.test(read('db/queries.js')));
check('Live routing is concurrency bounded', /mapWithConcurrency/.test(read('routes/time-intelligence.js')));
check('Frontend stale CI path removed', !/travel-intel-ui\.js/.test(read('.github/workflows/ci.yml')));
check('Docker image uses non-root runtime', /USER\s+(?:node|appuser)\b/.test(read('Dockerfile')));
check('Health endpoint exists', /\/api\/health/.test(read('server.js')));
check('Production error reporting is explicitly configured', process.env.NODE_ENV !== 'production' || !!process.env.ERROR_REPORTING_WEBHOOK_URL || !!process.env.SENTRY_DSN || process.env.OBSERVABILITY_PROVIDER === 'self-hosted');
check('Production frontend build is fail-closed', /Production frontend build is missing or unhealthy/.test(read('config/index.js')) && /if \(config\.isProd\)/.test(read('config/index.js')));
check('Production frontend forbids source override', /USE_SOURCE_FRONTEND is forbidden in production/.test(read('config/index.js')));
check('Inline event-handler gate exists', fs.existsSync(path.join(root, 'scripts/check-inline-handlers.js')));

check('Public readiness does not return raw dependency errors', !/checks\.(dbError|redisError)\s*=/.test(read('server.js')));
check('Anonymous feedback does not train the ML model', /if \(req\.uid\)/.test(read('routes/feedback.js')) && /WHERE user_id IS NOT NULL/.test(read('services/ml/crowdModel.js')));
check('Backup rejects disabled TLS verification in production', /DATABASE_SSL_REJECT_UNAUTHORIZED=false is not allowed in production/.test(read('scripts/backup-db.js')));
check('OpenAPI uses verified bearer admin auth', !/adminKey:/.test(read('docs/openapi.yaml')) && /bearerAuth:/.test(read('docs/openapi.yaml')));
check('Load smoke test exists', fs.existsSync(path.join(root, 'scripts/load-smoke.js')));
check('Staging acceptance gate exists', fs.existsSync(path.join(root, 'scripts/staging-acceptance.js')));
check('Failover smoke gate exists', fs.existsSync(path.join(root, 'scripts/failover-smoke.js')));
check('Deployment verification gate exists', fs.existsSync(path.join(root, 'scripts/verify-deployment.js')));
check('Staging acceptance documentation exists', fs.existsSync(path.join(root, 'docs/STAGING_ACCEPTANCE.md')));
if (failed) process.exit(1);
