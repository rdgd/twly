const fs = require('fs');
const path = require('path');
const defaults = require('./defaults');

function configure (runtimeConf) {
  // Attempt to read the .trc file, which is the designated name for a twly config file
  let trc;
  let configPath = runtimeConf.trc || defaults.trc;
  try {
    trc = JSON.parse(fs.readFileSync(`${process.cwd()}/${configPath}`, 'utf-8'));
  } catch (err) { trc = {}; }

  if (trc.ignore) { trc.ignore = trc.ignore.map(p => path.join(process.cwd(), p)); }

  return Object.assign({}, defaults, trc, runtimeConf);
}

module.exports = configure;
