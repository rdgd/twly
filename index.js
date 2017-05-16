#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const chalk = require('chalk');
const glob = require('glob');
const path = require('path');
const binaries = require('binary-extensions');

const Message = require('./message');
const Report = require('./report.js');
const state = require('./state');
const defaults = require('./defaults');
const isCli = require.main === module;
const cli = isCli ? require('commander') : null;
var config = {};

cli
  .option('-f, --files [glob]', 'Files you would like to analyze', '**/*.*')
  .option('-t, --threshold [integer or floating point]', 'Specify the point at which you would like Towelie to fail')
  .option('-l, --lines [integer]', 'Minimum number of lines a block must have to be compared')
  .option('-c, --chars [integer]', 'Minimum number of characters a block must have to be compared')
  .option('-b, --boring', 'Don\'t show TWLY picture on run')
  .parse(process.argv);

isCli && initCli();

function initCli () {
  // Length of three indicates only one arg passed, which we assume is a glob
  let glob = process.argv.length === 3 ? process.argv[2] : cli.files;
  let runtimeConf = { files: glob };

  if (!cli.boring) { console.log(chalk.green(require('./assets/towelie'))); }
  // CLI arguments take precedence over config file, since they are "closer" to runtime
  if (cli.threshold) { runtimeConf.threshold = cli.threshold; }
  if (cli.lines) { runtimeConf.minLines = cli.lines; }
  if (cli.chars) { runtimeConf.minChars = cli.chars; }

  main(runtimeConf);
}

// TODO: If config.files is an array, then we want to iterate over that array and do a run for each. Targets is better name, though.
// This application has 3 basic stages: (1) read files, (2) compare their contents, and (3) report TWLY's findings. 
function main (runtimeConf = {}) {
  config = (require('./config'))(runtimeConf);
  return read(config.files, config)
    .then(docs => compare(docs))
    .then(messages => report(messages))
    .catch((err) => { throw err; });
}

function read (pathsToRead, config) {
  return new Promise((resolve, reject) => {
    let docs = [];

    glob(path.join(process.cwd(), pathsToRead), config, (err, paths) => {
      paths.forEach((p, i) => {
        fs.readFile(p, (err, data) => {
          if (err) { console.log(chalk.red(`Error reading file "${p}"`)); throw err; }

          let txt = data.toString();
          state.totalFiles++;
          state.totalLines += numLines(txt);
          docs.push({ content: txt, filePath: p });
          if (docs.length === paths.length) { resolve(docs); }
        });
      });
    });
  });
}

// Break this into smaller functions... it's a bit unwieldy.
function compare (docs) {
  let messages = [];
  let fullDocHashes = {};
  let allBlockHashes = {};

  for (let i = 0; i < docs.length; i++) {
    let blocks = makeBlockArray(docs[i].content);
    let minifiedBlocks = minifyBlocks(blocks);
    let docHash = hashString(minify(docs[i].content));
    let fullDocumentMatch = docHash in fullDocHashes;

    /*
      We check if the hash of ALL of the minified content in current document already exists in our array of hashes
      If it does, that means we have a duplicate of an entire document, so we check to see if there is a message with
      that hash as a reference, and if there is then we add the docpath to the message... otherwise just add message
    */
    if (!fullDocumentMatch) {
      fullDocHashes[docHash] = { docInd: i };
    } else {
      let existingMsgInd = fullDocHashes[docHash].msgInd;
      let previouslyMatched = existingMsgInd > -1;
      if (previouslyMatched) {
        let msg = messages[existingMsgInd];
        (msg.docs.indexOf(docs[i].filePath) === -1) && msg.docs.push(docs[i].filePath);
      } else {
        // msgInd is a way to point to a "message" related to a hash, which is faster than iterating over all messages looking for a hash
        fullDocHashes[docHash].msgInd = messages.length;
        messages.push(new Message([docs[i].filePath, docs[fullDocHashes[docHash].docInd].filePath], 'identical file', docHash));
      }
      // Increment the relevant counters for reporting
      state.dupedLines += numLines(docs[i].content);
      state.numFileDupes++;
      /*
        If we don't continue here, then we will start matching the blocks of files which are pure duplicates
        However, if we do continue, then if a different file shares a fragment with the current file, we will not realize.
        The solution might be to not continue here, but skip blocks who have hashes that map files which are perfect duplicates,
        so check below at match time... a duplicate message will have already been created. Related to: https://github.com/rdgd/twly/issues/4
      */
      continue;
    }

    // If the file being examined is not a text file, we want to evaluate only it's full signature
    if (!isTextFile(docs[i].filePath)) { continue; }

    // We iterate over the current document's minified blocks
    for (let b = 0; b < minifiedBlocks.length; b++) {
      // First we must check if this block is even worth checking, as we have config params which set some criteria for the content size
      if (!meetsSizeCriteria(blocks[b], (config.minLines - 1), config.minChars)) { continue; }
      let block = blocks[b];
      let blockHash = hashString(minifiedBlocks[b]);
      let blockMatch = blockHash in allBlockHashes;
      /*
        Checking if minified block hash exists in array of all block hashes. If it doesn't
        then we just add the hash to the global block/block hash array. If it does then we need to know
        if it has simply been added there or also has a message associated with it.
      */
      if (!blockMatch) {
        /*
          Assigning the value to the document hash because we want to be able to look up the correct index 
          for the doc in the docs array and to get that index we look at the full document hash index 
          object with the document hash as its key
        */
        allBlockHashes[blockHash] = fullDocHashes[docHash].docInd; 
      }

      if (blockMatch) {
        let docInd = allBlockHashes[blockHash];
        let file1 = docs[i].filePath;  // Current file of main file loop
        let file2 = docs[docInd].filePath; // File where match was found
        let inSameFile = file1 === file2;
        let dupeMsgInd = findDuplicateMsgInd(blockHash, messages);
        let firstTimeMatched = dupeMsgInd === -1;

        state.dupedLines += numLines(block);
        state.numBlockDupes++;

        if (inSameFile) {
          // TODO: Add count for number of times repeated in the same file
          state.numBlockDupesInFile++;
          messages.push(new Message([file1], 'intra-file duplicate', blockHash, blocks[b]));
        }

        if (!inSameFile && !firstTimeMatched) {
          // This is also an 'inter-file duplicate' scenario
          let duplicateMsg = messages[dupeMsgInd];
          let alreadyReportedByCurrentFile = duplicateMsg.docs.indexOf(file1) > -1;
          if (!alreadyReportedByCurrentFile) { duplicateMsg.docs.push(file1); }
        }

        if (!inSameFile && firstTimeMatched) {
          /*
            Need to figure out if there is a message with the same files for a message we are about to write,
            and if so, add the content to that message. TODO: We also need to be able to add that content's hash to an array
            of hashes instead of just a single hash so that we can pick up duplicate content still.
          */
          let dupeMsgInd = getMsgIndByFiles([file1, file2], messages);
          if (dupeMsgInd === -1) {
            messages.push(new Message([file1, file2], 'inter-file duplicate', blockHash, blocks[b]));
          } else {
            messages[dupeMsgInd].content.push(blocks[b]);
            messages[dupeMsgInd].hashes.push(blockHash);
          }
        }
      }
    }
  }

  console.log(fullDocHashes);
  console.log(messages);
  console.log(allBlockHashes);
  return messages;
}

function report (messages) {
  state.numFileDupes = state.numFileDupes === 0 ? state.numFileDupes : (state.numFileDupes + 1);
  let r = new Report(state, messages, config.failureThreshold);

  config.logLevel === 'REPORT' && r.log(config.exitOnFailure);
  return r;
}

// Utility functions used throughout the above code ^^^
function findDuplicateMsgInd (hash, msgs) {
  let dupeInd = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].hashes && msgs[i].hashes.indexOf(hash) > -1) {
      dupeInd = i;
      break;
    }
  }

  return dupeInd;
}

function getMsgIndByFiles (files, msgs) {
  let ind = -1;

  for (let m = 0; m < msgs.length; m++) {
    let hasAllFiles = false;
    files.forEach(function (file, f) {
      hasAllFiles = msgs[m].docs.indexOf(file) > -1;
    });
    if (hasAllFiles) { ind = m; break;}
  }
  return ind;
}

function hasMoreNewlinesThan (p, n, eq) {
  let matches = p.match(/\n/g);
  return eq ? (matches && matches.length >= n) : (matches && matches.length > n);
}

function numLines (s) {
  let matches = s.match(/\n/g);
  return matches ? matches.length : 0;
}

function meetsSizeCriteria (p, minLines, minChars) {
  return hasMoreNewlinesThan(p, minLines, true) && p.length > minChars;
}

function hashString (s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function makeBlockArray (s) {
  return removeEmpty(s.split('\n\n'));
}

function minifyBlocks (arr) {
  return removeEmpty(arr).map(minify);
}

function removeEmpty (arr) {
  return arr.filter(function (arr) { return arr !== ''; });
}

function minify (s) {
  return s.replace(/(\n|\s|\t)/g, '');
}

function isTextFile (filePath) {
   return !binaries.includes(filePath.split('.').pop());
}

module.exports = main;
