'use strict';
// Offline SLO report helper (runtime report is GET /api/slo)
console.log(JSON.stringify({
  targets: { availability: 0.999, latencyP99Ms: 2000 },
  note: 'Live report: GET /api/slo (admin auth). Samples collected via sloMiddleware.',
}, null, 2));
