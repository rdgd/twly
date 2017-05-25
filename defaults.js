'use strict';
var path = require('path');

module.exports = {
  ignore: [
    path.join(process.cwd(),'node_modules/**/*.*'),
    path.join(process.cwd(),'bower_components/**/*.*'),
    path.join(process.cwd(),'.git/**/*.*')
  ],
  nodir: true,
  logLevel: 'REPORT',
  threshold: 95,
  exitOnFailure: true,
  minLines: 4,
  minChars: 100,
  trc: '.trc'
};