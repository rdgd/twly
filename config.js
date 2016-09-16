'use strict';
var path = require('path');

module.exports = {
  ignore: [ path.join(process.cwd(),'node_modules/**/*.*'), path.join(process.cwd(),'bower_components/**/*.*'), path.join(process.cwd(),'.git/**/*.*') ],
  nodir: true,
  failureThreshold: 95,
  minLines: 4,
  minChars: 100
};