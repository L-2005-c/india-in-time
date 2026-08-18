'use strict';
const { spawnSync } = require('node:child_process');
const gates=[
 ['production-config',[process.platform==='win32'?'node':'node','scripts/production-config-smoke.js']],
 ['production-checks',['node','scripts/production-check.js']],
 ['inline-handler-gate',['node','scripts/check-inline-handlers.js']],
 ['deployment-check',['node','scripts/verify-deployment.js']],
 ['lint',['npm','run','lint']],
 ['unit-and-coverage',['npm','run','test:ci']],
 ['security',['npm','run','security:audit']],
 ['production-security',['npm','run','security:audit:prod']],
 ['frontend-build',['npm','run','build:frontend']],
 ['bundle-check',['npm','run','check:bundle']],
];
for(const [name,cmd] of gates){console.log(`\n=== ${name} ===`);const [bin,...args]=cmd;const r=spawnSync(bin,args,{stdio:'inherit',env:process.env});if(r.status!==0){console.error(`Acceptance gate failed: ${name}`);process.exit(r.status||1);}}
console.log('\nAll repository acceptance gates passed.');
