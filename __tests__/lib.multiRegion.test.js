'use strict';
const { getRegionInfo } = require('../lib/multiRegion');
test('region info', () => {
  expect(getRegionInfo()).toHaveProperty('region');
});
