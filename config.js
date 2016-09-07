'use strict';
var path = require('path');
const FAILURE_THRESHOLD = 95;

module.exports = {
  FAILURE_THRESHOLD: FAILURE_THRESHOLD,
  defaults: {
    ignore: [ path.join(process.cwd(),'node_modules/**/*.*') ]
  }
};