'use strict';
var path = require('path');

module.exports = {
  ignore: [ path.join(process.cwd(),'node_modules/**/*.*') ],
  failureThreshold: 95,
  minLines: 4,
  minChars: 100
};