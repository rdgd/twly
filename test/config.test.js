const path = require('path');
const configure = require('../config');

test('Specifying a .trc file', () => {
  let conf = configure({ minChars: 500, trc:  'test/test.trc' });
  expect(conf.threshold).toEqual(99.27);
  expect(conf.minChars).toEqual(500);
  expect(conf.minLines).toEqual(4);
});

test('Specifying runtime config without .trc file', () => {
  let conf = configure({ threshold: 66, logLevel: 'ERROR' });
  expect(conf.threshold).toEqual(66);
  expect(conf.logLevel).toEqual('ERROR');
  expect(conf.minLines).toEqual(4);
});
