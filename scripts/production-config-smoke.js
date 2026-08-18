'use strict';
const { spawnSync } = require('node:child_process');
function runCase(name, env, expectedExit) {
  const r = spawnSync(process.execPath, ['-e', `const config=require('./config'); try { config.validateProductionConfig(); process.stdout.write('VALID'); } catch(e) { process.stdout.write('INVALID:'+e.message); process.exit(3); }`], { env:{...process.env,...env}, encoding:'utf8' });
  const ok=r.status===expectedExit;
  console.log(`${ok?'✓':'✗'} ${name} — exit=${r.status} stdout=${r.stdout.trim()}`);
  if(!ok) process.exitCode=1;
}
runCase('production config import does not kill host process',{NODE_ENV:'production',GEMINI_API_KEY:'',FIREBASE_SERVICE_ACCOUNT:'',REDIS_URL:''},3);
runCase('complete production config validates',{NODE_ENV:'production',GEMINI_API_KEY:'test-key',FIREBASE_SERVICE_ACCOUNT:'{}',REDIS_URL:'redis://localhost:6379',CORS_ORIGIN:'https://example.com'},0);
if(process.exitCode) process.exit(1);
