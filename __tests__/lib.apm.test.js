'use strict';
const apm = require('../lib/apm');
test('apm info', () => {
  const i = apm.getApmInfo();
  expect(i.service).toBeTruthy();
  expect(() => apm.captureException(new Error('x'))).not.toThrow();
});
